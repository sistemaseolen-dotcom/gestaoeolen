// Regra de negócio pedida pelo Diego: inativar uma pessoa ou uma empresa não
// pode deixar as outras telas "erradas" — precisa se propagar:
//
//   1. Empresa inativada (status -> INATIVO) -> todas as pessoas vinculadas
//      a ela (pessoas.empresa_id = essa empresa) também são inativadas.
//      Isso é uma ação deliberada sobre a EMPRESA (ex.: parar de trabalhar
//      com aquele prestador de serviço) — continua cascateando de
//      propósito.
//   2. Pessoa inativada -> é desvinculada de qualquer equipe onde apareça
//      (como membro comum em equipe_membros, ou como team_lider_id de uma
//      equipe) — uma pessoa inativa não deve continuar "presa" numa equipe.
//
// CORRIGIDO (16/10/2026, pedido do Diego, usando a RSI de exemplo): inativar
// UMA pessoa NÃO inativa mais a empresa dela nem as outras pessoas vinculadas
// ao mesmo CNPJ/empresa. Antes, `inativarPessoaCascata` chamava
// `inativarEmpresaCascata` sempre que a pessoa tinha `empresa_id`, o que
// fazia sentido só pro caso 1-pessoa-1-empresa (MEI), mas inativava TODO
// MUNDO nas empresas prestadoras de serviço com vários funcionários (ex.:
// RSI, ALLIANCE SERVICES com 52 pessoas) ao inativar só 1 delas. Diego:
// "Se eu inativei apenas uma pessoa, não [posso inativar] as outras que
// estão vinculadas àquela empresa." Agora o cascateamento só roda no
// sentido empresa -> pessoas (ação explícita na aba Empresas), nunca no
// sentido pessoa -> empresa -> outras pessoas.
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
// update/auditoria) e desvincula de qualquer equipe.
//
// NÃO propaga mais pra empresa (correção de 16/10/2026, ver comentário no
// topo do arquivo) -- inativar 1 pessoa nunca inativa a empresa dela nem as
// outras pessoas vinculadas ao mesmo CNPJ/empresa, mesmo em empresas
// prestadoras de serviço com vários funcionários (RSI, Alliance, etc.).
export async function inativarPessoaCascata(
  pessoaId: number,
  usuario: UsuarioRow | null,
  visitedPessoas: Set<number> = new Set()
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
}

// Inativa uma empresa "em cascata": garante status=INATIVO e inativa (em
// cascata) todas as pessoas ainda não-inativas vinculadas a ela. Essa
// direção (empresa -> pessoas) continua existindo de propósito -- é uma
// ação deliberada sobre a empresa (ex.: parar de trabalhar com aquele
// prestador de serviço), diferente de inativar só 1 funcionário dela.
export async function inativarEmpresaCascata(
  empresaId: number,
  usuario: UsuarioRow | null,
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
    await inativarPessoaCascata(p.id, usuario);
  }
}
