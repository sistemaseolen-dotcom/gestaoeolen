import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields, auditDelete } from "@/lib/audit";
import { ACESSO_PROJETOS, ACESSO_REGIONAIS, filtrarLista, validarOperadora } from "@/lib/acesso";

const CAMPOS_ACESSO_EQUIPE = [
  "nome_equipe", "operadora", "projetos", "regionais", "atividade", "empresa", "status", "validade", "contrato",
] as const;

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("acesso", "editar");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: before, error: fetchError } = await admin.from("acesso_equipes").select("*").eq("id", id).maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });
  }

  const patch: Record<string, any> = {};

  if (Object.prototype.hasOwnProperty.call(body, "nomeEquipe")) {
    const nomeEquipe = (body.nomeEquipe || "").toString().trim();
    if (!nomeEquipe) {
      return NextResponse.json({ error: "Informe o nome da equipe." }, { status: 400 });
    }
    patch.nome_equipe = nomeEquipe;
  }
  if (Object.prototype.hasOwnProperty.call(body, "operadora")) {
    const operadora = validarOperadora(body.operadora);
    if (!operadora) {
      return NextResponse.json({ error: "Operadora inválida. Use TIM, CLARO ou VIVO." }, { status: 400 });
    }
    patch.operadora = operadora;
  }
  if (Object.prototype.hasOwnProperty.call(body, "projetos")) patch.projetos = filtrarLista(body.projetos, ACESSO_PROJETOS);
  if (Object.prototype.hasOwnProperty.call(body, "regionais")) patch.regionais = filtrarLista(body.regionais, ACESSO_REGIONAIS);
  if (Object.prototype.hasOwnProperty.call(body, "atividade")) patch.atividade = body.atividade ? String(body.atividade).trim() : null;
  if (Object.prototype.hasOwnProperty.call(body, "empresa")) patch.empresa = body.empresa ? String(body.empresa).trim().toUpperCase() : null;
  if (Object.prototype.hasOwnProperty.call(body, "status")) patch.status = body.status ? String(body.status).trim().toUpperCase() : null;
  if (Object.prototype.hasOwnProperty.call(body, "validade")) patch.validade = body.validade || null;
  if (Object.prototype.hasOwnProperty.call(body, "contrato")) patch.contrato = body.contrato ? String(body.contrato).trim() : null;
  patch.atualizado_em = new Date().toISOString();

  const { data: after, error: updateError } = await admin
    .from("acesso_equipes")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await auditDiffFields({
    entidade: "acesso_equipe",
    entidadeId: id,
    entidadeLabel: after.nome_equipe,
    before,
    after,
    campos: [...CAMPOS_ACESSO_EQUIPE],
    usuario: gate.user,
  });

  return NextResponse.json(after);
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("acesso", "excluir");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: equipe, error: fetchError } = await admin.from("acesso_equipes").select("*").eq("id", id).maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!equipe) {
    return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });
  }

  // acesso_membros tem FK ON DELETE CASCADE para equipe_id — não precisa
  // apagar os membros manualmente aqui.
  const { error: deleteError } = await admin.from("acesso_equipes").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await auditDelete("acesso_equipe", id, equipe.nome_equipe, gate.user);

  return NextResponse.json({ ok: true });
}
