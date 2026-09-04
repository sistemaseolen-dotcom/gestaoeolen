import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "auditorias-anexos";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB — fotos de celular com marca d'água já embutida
const SLOT_KEY_REGEX = /^[a-z0-9_]+$/;

function extensaoDe(nome: string, tipo: string): string {
  const m = /\.[a-zA-Z0-9]+$/.exec(nome || "");
  if (m) return m[0].toLowerCase();
  if (tipo === "image/png") return ".png";
  return ".jpg";
}

// Envia (ou substitui) a foto de UM slot do checklist — cada slot_key é
// único dentro da auditoria (ex.: foto_torre, foto_ca_capacete_1,
// assinatura_inspetor). Faz upsert: se já existia uma foto nesse slot, o
// arquivo antigo é removido do Storage antes de subir o novo.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("auditorias", "editar");
  if (gate.response) return gate.response;

  const auditoriaId = Number(params.id);
  if (Number.isNaN(auditoriaId)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo muito grande (máx. 8MB)." }, { status: 400 });
  }
  const slotKey = (formData.get("slotKey") || "").toString().trim();
  if (!slotKey || !SLOT_KEY_REGEX.test(slotKey)) {
    return NextResponse.json({ error: "Identificador de foto (slotKey) inválido." }, { status: 400 });
  }
  const label = (formData.get("label") || "").toString().trim() || null;
  const comentario = (formData.get("comentario") || "").toString().trim() || null;
  const sortOrder = Number(formData.get("sortOrder")) || 0;
  const originalName = "name" in file && typeof (file as any).name === "string" ? (file as any).name : "foto.jpg";

  const admin = supabaseAdmin();

  const { data: auditoria, error: auditoriaError } = await admin.from("auditorias").select("id").eq("id", auditoriaId).maybeSingle();
  if (auditoriaError) return NextResponse.json({ error: auditoriaError.message }, { status: 500 });
  if (!auditoria) return NextResponse.json({ error: "Auditoria não encontrada." }, { status: 404 });

  const { data: existente } = await admin
    .from("auditoria_fotos")
    .select("id, arquivo_path")
    .eq("auditoria_id", auditoriaId)
    .eq("slot_key", slotKey)
    .maybeSingle();

  const path = `${auditoriaId}/${slotKey}${extensaoDe(originalName, file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  let row;
  if (existente) {
    const { data, error } = await admin
      .from("auditoria_fotos")
      .update({ label, comentario, arquivo_path: path, sort_order: sortOrder })
      .eq("id", existente.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    row = data;
  } else {
    const { data, error } = await admin
      .from("auditoria_fotos")
      .insert({ auditoria_id: auditoriaId, slot_key: slotKey, label, comentario, arquivo_path: path, sort_order: sortOrder })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    row = data;
  }

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 300);
  return NextResponse.json({ ...row, url: signed?.signedUrl || null });
}
