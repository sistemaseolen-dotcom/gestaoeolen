import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { montarPatchMembro } from "@/lib/acesso";

export async function PATCH(req: Request, { params }: { params: { id: string; membroId: string } }) {
  const gate = await requirePermission("acesso", "editar");
  if (gate.response) return gate.response;

  const equipeId = Number(params.id);
  const membroId = Number(params.membroId);
  if (Number.isNaN(equipeId) || Number.isNaN(membroId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: before, error: fetchError } = await admin
    .from("acesso_membros")
    .select("*")
    .eq("id", membroId)
    .eq("equipe_id", equipeId)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: "Integrante não encontrado." }, { status: 404 });
  }

  const patch: Record<string, any> = montarPatchMembro(body, { apenasPresentes: true });
  if (Object.prototype.hasOwnProperty.call(body, "nome")) {
    const nome = (body.nome || "").toString().trim();
    if (!nome) {
      return NextResponse.json({ error: "Informe o nome do integrante." }, { status: 400 });
    }
    patch.nome = nome;
  }
  patch.atualizado_em = new Date().toISOString();

  const { data: after, error: updateError } = await admin
    .from("acesso_membros")
    .update(patch)
    .eq("id", membroId)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { data: equipe } = await admin.from("acesso_equipes").select("nome_equipe").eq("id", equipeId).maybeSingle();
  await supabaseAdmin().from("audit_log").insert({
    entidade: "acesso_equipe",
    entidade_id: equipeId,
    entidade_label: equipe?.nome_equipe || "—",
    acao: "editar",
    campo: "membros",
    campo_label: "Membros",
    de: `${before.nome}${before.funcao ? ` (${before.funcao})` : ""}`,
    para: `${after.nome}${after.funcao ? ` (${after.funcao})` : ""}`,
    usuario_id: gate.user?.id ?? null,
    usuario_nome: gate.user?.nome ?? "—",
  });

  return NextResponse.json(after);
}

export async function DELETE(_req: Request, { params }: { params: { id: string; membroId: string } }) {
  const gate = await requirePermission("acesso", "editar");
  if (gate.response) return gate.response;

  const equipeId = Number(params.id);
  const membroId = Number(params.membroId);
  if (Number.isNaN(equipeId) || Number.isNaN(membroId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: membro, error: fetchError } = await admin
    .from("acesso_membros")
    .select("*")
    .eq("id", membroId)
    .eq("equipe_id", equipeId)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!membro) {
    return NextResponse.json({ error: "Integrante não encontrado." }, { status: 404 });
  }

  const { error: deleteError } = await admin.from("acesso_membros").delete().eq("id", membroId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { data: equipe } = await admin.from("acesso_equipes").select("nome_equipe").eq("id", equipeId).maybeSingle();
  await supabaseAdmin().from("audit_log").insert({
    entidade: "acesso_equipe",
    entidade_id: equipeId,
    entidade_label: equipe?.nome_equipe || "—",
    acao: "editar",
    campo: "membros",
    campo_label: "Membros",
    de: `${membro.nome}${membro.funcao ? ` (${membro.funcao})` : ""}`,
    para: null,
    usuario_id: gate.user?.id ?? null,
    usuario_nome: gate.user?.nome ?? "—",
  });

  return NextResponse.json({ ok: true });
}
