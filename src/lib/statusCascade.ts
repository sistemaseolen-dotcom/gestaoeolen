// Regra de negócio pedida pelo Diego: inativar uma pessoa ou uma empresa não
// pode deixar as outras telas "erradas" — precisa se propagar:
//
//   1. Pessoa inativada (status -> INATIVO) e vinculada a uma empresa
//      (pessoas.empresa_id) -> a empresa também é inativada.
//   2. Empresa inativada (status -> INATIVO) -> todas as pessoas vinculadas
//      a ela (pessoas.empresa_id = essa empresa) também são inativadas.
//   3. Pessoa inativada -> é desvinculada de qualquer equipe onde apareça
//      (como membro comum em equipe_membros, ou como team_lider_id de uma
//      equipe) — uma pessoa inativa não deve continuar "presa" numa equipe.
//
// (1) e (2) se retroalimentam de propósito (inativar uma pessoa pode
// inativar a empresa, que por sua vez inativa as outras pessoas dela, que
// por sua vez são desvinculadas das próprias equipes) — os Sets `visitedPessoas`/
// `visitedEmpresas` evitam reprocessar a mesma linha duas vezes e garantem
// que a recursão sempre termina.
//
// Só cobre as rotas manuais (/api/pessoas/[id], /api/empresas/[id]) — a
// sincronização com o GPO (gpoSync.ts) já não grava audit_log de propósito
// (é um processo em lote, não uma edição manual), então fica fora desse
// cascateamento por enquanto.
import { supabaseAdmin } from "./supabaseAdmin";
import { auditDiffFields } from "./audit";
import type { UsuarioRow } from "./permissions";

async function auditMembroRemovidoAutomaticamente(
  equipeId: number,
  equipeNome: string,
  deLabel: string,
  usuario: UsuarioRow | null
) {
  const { error } = await supabaseAdmin().from("audit_log").insert({
    entidade: "equipe",
    entidade_id: equipeId,
    entidade_label: equipeNome,
    acao: "editar",
    campo: "membros",
    campo_label: "Membros",
    de: deLabel,
    para: null,
    usuario_id: usuario?.id ?? null,
    usuario_nome: usuario?.nome ?? "—",
  });
  if (error) throw error;
}

// Remove a pessoa de toda equipe em que ela apareça — como membro comum
// (equipe_membros) ou como team_lider_id/team_lider (cache de nome) da
// própria equipe.
export async function desvincularPessoaDeEquipes(pessoaId: number, usuario: UsuarioRow | null) {
  const admin = supabaseAdmin();

  const { data: membros, error: membrosError } = await admin
    .from("equipe_membros")
    .select("id, equipe_id, cargo, pessoa_nome, equipes(nome)")
    .eq("pessoa_id", pessoaId);
  if (membrosError) throw membrosError;

  for (const m of membros || []) {
    const equipeRel = (m as any).equipes as { nome?: string } | { nome?: string }[] | null;
    const equipeNome = (Array.isArray(equipeRel) ? equipeRel[0]?.nome : equipeRel?.nome) || `Equipe #${m.equipe_id}`;
    const { error: delError } = await admin.from("equipe_membros").delete().eq("id", m.id);
    if (delError) throw delError;
    await auditMembroRemovidoAutomaticamente(
      m.equipe_id,
      equipeNome,
      `${m.pessoa_nome || ""}${m.cargo ? ` (${m.cargo})` : ""} — desvinculado automaticamente (pessoa inativada)`,
      usuario
    );
  }

  const { data: lideradas, error: lideradasError } = await admin
    .from("equipes")
    .select("*")
    .eq("team_lider_id", pessoaId);
  if (lideradasError) throw lideradasError;

  for (const eq of lideradas || []) {
    const { data: after, error: updError } = await admin
      .from("equipes")
      .update({ team_lider_id: null, team_lider: null })
      .eq("id", eq.id)
      .select()
      .single();
    if (updError) throw updError;
    await auditDiffFields({
      entidade: "equipe",
      entidadeId: eq.id,
      entidadeLabel: after.nome,
      before: eq,
      after,
      campos: ["team_lider_id", "team_lider"],
      usuario,
    });
  }
}

// Inativa uma pessoa "em cascata": garante status=INATIVO (se ela já foi
// marcada INATIVO pela própria rota que chamou esta função, não duplica o
// update/auditoria), desvincula de qualquer equipe e propaga pra empresa
// vinculada, se houver.
export async function inativarPessoaCascata(
  pessoaId: number,
  usuario: UsuarioRow | null,
  visitedPessoas: Set<number> = new Set(),
  visitedEmpresas: Set<number> = new Set()
) {
  if (visitedPessoas.has(pessoaId)) return;
  visitedPessoas.add(pessoaId);

  const admin = supabaseAdmin();
  const { data: before, error: fetchError } = await admin.from("pessoas").select("*").eq("id", pessoaId).maybeSingle();
  if (fetchError) throw fetchError;
  if (!before) return;

  if (before.status !== "INATIVO") {
    const { data: after, error: updError } = await admin
      .from("pessoas")
      .update({ status: "INATIVO" })
      .eq("id", pessoaId)
      .select()
      .single();
    if (updError) throw updError;
    await auditDiffFields({
      entidade: "pessoa",
      entidadeId: pessoaId,
      entidadeLabel: after.nome,
      before,
      after,
      campos: ["status"],
      usuario,
    });
  }

  await desvincularPessoaDeEquipes(pessoaId, usuario);

  if (before.empresa_id) {
    await inativarEmpresaCascata(before.empresa_id, usuario, visitedPessoas, visitedEmpresas);
  }
}

// Inativa uma empresa "em cascata": garante status=INATIVO e inativa (em
// cascata) todas as pessoas ainda não-inativas vinculadas a ela.
export async function inativarEmpresaCascata(
  empresaId: number,
  usuario: UsuarioRow | null,
  visitedPessoas: Set<number> = new Set(),
  visitedEmpresas: Set<number> = new Set()
) {
  if (visitedEmpresas.has(empresaId)) return;
  visitedEmpresas.add(empresaId);

  const admin = supabaseAdmin();
  const { data: before, error: fetchError } = await admin.from("empresas").select("*").eq("id", empresaId).maybeSingle();
  if (fetchError) throw fetchError;
  if (!before) return;

  if (before.status !== "INATIVO") {
    const { data: after, error: updError } = await admin
      .from("empresas")
      .update({ status: "INATIVO" })
      .eq("id", empresaId)
      .select()
      .single();
    if (updError) throw updError;
    await auditDiffFields({
      entidade: "empresa",
      entidadeId: empresaId,
      entidadeLabel: after.nome,
      before,
      after,
      campos: ["status"],
      usuario,
    });
  }

  const { data: pessoas, error: pessoasError } = await admin
    .from("pessoas")
    .select("id, status")
    .eq("empresa_id", empresaId);
  if (pessoasError) throw pessoasError;

  for (const p of pessoas || []) {
    if (p.status === "INATIVO") continue;
    await inativarPessoaCascata(p.id, usuario, visitedPessoas, visitedEmpresas);
  }
}
