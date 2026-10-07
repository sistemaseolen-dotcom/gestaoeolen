import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { UsuarioRow } from "@/lib/permissions";
import { montarPatchMembro } from "@/lib/acesso";

// Adicionar/remover membro não é um diff de coluna (é uma linha inteira em
// acesso_membros), então gravamos a linha de audit_log diretamente — mesmo
// padrão usado em /api/equipes/[id]/membros.
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
    entidade: "acesso_equipe",
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
  const gate = await requirePermission("acesso", "editar");
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

  const nome = (body?.nome || "").toString().trim();
  if (!nome) {
    return NextResponse.json({ error: "Informe o nome do integrante." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: equipe, error: equipeError } = await admin
    .from("acesso_equipes")
    .select("id, nome_equipe")
    .eq("id", equipeId)
    .maybeSingle();
  if (equipeError) {
    return NextResponse.json({ error: equipeError.message }, { status: 500 });
  }
  if (!equipe) {
    return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });
  }

  const payload = { equipe_id: equipeId, nome, ...montarPatchMembro(body) };

  const { data: membro, error: insertError } = await admin.from("acesso_membros").insert(payload).select().single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await auditMembro({
    equipeId,
    equipeNome: equipe.nome_equipe,
    acao: "editar",
    de: null,
    para: `${nome}${membro.funcao ? ` (${membro.funcao})` : ""}`,
    usuario: gate.user,
  });

  return NextResponse.json(membro, { status: 201 });
}
