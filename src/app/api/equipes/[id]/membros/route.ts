import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { UsuarioRow } from "@/lib/permissions";

// Adicionar/remover membro não é um diff de coluna (é uma linha inteira em
// equipe_membros), então não dá pra usar auditDiffFields aqui — gravamos a
// linha de audit_log diretamente, no mesmo formato que ele produziria.
async function auditMembro(opts: {
  equipeId: number;
  equipeNome: string;
  acao: "editar";
  de: string | null;
  para: string | null;
  usuario: UsuarioRow | null;
}) {
  const { equipeId, equipeNome, acao, de, para, usuario } = opts;
  const { error } = await supabaseAdmin().from("audit_log").insert({
    entidade: "equipe",
    entidade_id: equipeId,
    entidade_label: equipeNome,
    acao,
    campo: "membros",
    campo_label: "Membros",
    de,
    para,
    usuario_id: usuario?.id ?? null,
    usuario_nome: usuario?.nome ?? "—",
  });
  if (error) throw error;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("equipes", "editar");
  if (gate.response) return gate.response;

  const equipeId = Number(params.id);
  if (Number.isNaN(equipeId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const pessoaId = Number(body?.pessoaId);
  if (Number.isNaN(pessoaId)) {
    return NextResponse.json({ error: "Informe a pessoa a ser adicionada." }, { status: 400 });
  }
  const cargo = body?.cargo ? String(body.cargo) : null;

  const admin = supabaseAdmin();

  const { data: equipe, error: equipeError } = await admin
    .from("equipes")
    .select("id, nome")
    .eq("id", equipeId)
    .maybeSingle();
  if (equipeError) {
    return NextResponse.json({ error: equipeError.message }, { status: 500 });
  }
  if (!equipe) {
    return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });
  }

  const { data: pessoa, error: pessoaError } = await admin
    .from("pessoas")
    .select("id, nome")
    .eq("id", pessoaId)
    .maybeSingle();
  if (pessoaError) {
    return NextResponse.json({ error: pessoaError.message }, { status: 500 });
  }
  if (!pessoa) {
    return NextResponse.json({ error: "Pessoa não encontrada." }, { status: 404 });
  }

  // Trava (pedido do Diego, 16/10/2026): uma pessoa não pode estar em duas
  // equipes diferentes ao mesmo tempo. Se já está em outra equipe, bloqueia
  // aqui -- quem quiser mudar a pessoa de equipe precisa removê-la da
  // equipe antiga primeiro (a mensagem já diz qual é).
  // (select simples + limit, não maybeSingle -- se por algum motivo já
  // existir mais de uma outra equipe com esta pessoa, maybeSingle() lançaria
  // erro por não ser "single row" em vez de só bloquear igual)
  const { data: outrasEquipes, error: outraEquipeError } = await admin
    .from("equipe_membros")
    .select("equipe_id")
    .eq("pessoa_id", pessoaId)
    .neq("equipe_id", equipeId)
    .limit(1);
  if (outraEquipeError) {
    return NextResponse.json({ error: outraEquipeError.message }, { status: 500 });
  }
  const outraEquipe = outrasEquipes && outrasEquipes[0];
  if (outraEquipe) {
    const { data: outraEquipeRow } = await admin.from("equipes").select("nome").eq("id", outraEquipe.equipe_id).maybeSingle();
    const nomeOutraEquipe = outraEquipeRow?.nome || `equipe #${outraEquipe.equipe_id}`;
    return NextResponse.json(
      { error: `${pessoa.nome} já está na equipe "${nomeOutraEquipe}". Remova-a de lá antes de adicionar nesta equipe.` },
      { status: 409 }
    );
  }

  const { data: membro, error: insertError } = await admin
    .from("equipe_membros")
    .insert({ equipe_id: equipeId, pessoa_id: pessoaId, pessoa_nome: pessoa.nome, cargo })
    .select()
    .single();
  if (insertError) {
    // Violação da constraint unique(equipe_id, pessoa_id) — pessoa já está
    // na equipe. Código 23505 é o padrão do Postgres para unique_violation.
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "Essa pessoa já é membro desta equipe." }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await auditMembro({
    equipeId,
    equipeNome: equipe.nome,
    acao: "editar",
    de: null,
    para: `${pessoa.nome}${cargo ? ` (${cargo})` : ""}`,
    usuario: gate.user,
  });

  return NextResponse.json(membro, { status: 201 });
}
