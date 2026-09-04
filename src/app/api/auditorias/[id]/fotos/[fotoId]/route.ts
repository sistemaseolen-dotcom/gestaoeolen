import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "auditorias-anexos";

export async function DELETE(_req: Request, { params }: { params: { id: string; fotoId: string } }) {
  const gate = await requirePermission("auditorias", "editar");
  if (gate.response) return gate.response;

  const auditoriaId = Number(params.id);
  const fotoId = Number(params.fotoId);
  if (Number.isNaN(auditoriaId) || Number.isNaN(fotoId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: foto, error: fetchError } = await admin
    .from("auditoria_fotos")
    .select("id, arquivo_path")
    .eq("id", fotoId)
    .eq("auditoria_id", auditoriaId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!foto) return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });

  await admin.storage.from(BUCKET).remove([foto.arquivo_path]);
  const { error: deleteError } = await admin.from("auditoria_fotos").delete().eq("id", fotoId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
