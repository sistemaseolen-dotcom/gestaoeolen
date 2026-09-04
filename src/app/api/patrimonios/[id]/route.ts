import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields, auditDelete } from "@/lib/audit";

const CAMPOS_PATRIMONIO = ["codigo", "tipo", "modelo", "serie", "valor", "status", "responsavel_nome"] as const;

function parseValorInput(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("patrimonio", "editar");
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

  const { data: before, error: fetchError } = await admin
    .from("patrimonios")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: "Item de patrimônio não encontrado." }, { status: 404 });
  }

  const patch: Record<string, any> = {};
  if (Object.prototype.hasOwnProperty.call(body, "codigo")) patch.codigo = (body.codigo || "").toString().trim() || null;
  if (Object.prototype.hasOwnProperty.call(body, "tipo")) patch.tipo = (body.tipo || "").toString().trim() || null;
  if (Object.prototype.hasOwnProperty.call(body, "modelo")) patch.modelo = (body.modelo || "").toString().trim() || null;
  if (Object.prototype.hasOwnProperty.call(body, "serie")) patch.serie = (body.serie || "").toString().trim() || null;
  if (Object.prototype.hasOwnProperty.call(body, "valor")) patch.valor = parseValorInput(body.valor);
  if (Object.prototype.hasOwnProperty.call(body, "status")) patch.status = (body.status || "").toString().trim() || null;
  if (Object.prototype.hasOwnProperty.call(body, "responsavelNome")) patch.responsavel_nome = (body.responsavelNome || "").toString().trim() || null;

  patch.atualizado_em = new Date().toISOString();

  const { data: after, error: updateError } = await admin
    .from("patrimonios")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await auditDiffFields({
    entidade: "patrimonio",
    entidadeId: id,
    entidadeLabel: after.codigo || after.tipo || `Item ${id}`,
    before,
    after,
    campos: [...CAMPOS_PATRIMONIO],
    usuario: gate.user,
  });

  return NextResponse.json(after);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("patrimonio", "excluir");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: item, error: fetchError } = await admin
    .from("patrimonios")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ error: "Item de patrimônio não encontrado." }, { status: 404 });
  }

  const { error: deleteError } = await admin.from("patrimonios").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Aviso: se este item veio do GPO (legacy_id preenchido) e continuar
  // existindo lá, a próxima sincronização o recria aqui (upsert por
  // legacy_id) — a exclusão só "gruda" para itens só locais ou também
  // removidos no GPO.
  await auditDelete("patrimonio", id, item.codigo || item.tipo || `Item ${id}`, gate.user);

  return NextResponse.json({ ok: true });
}
