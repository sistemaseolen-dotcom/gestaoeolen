import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB — mesmo limite validado no cliente da versão antiga.
const BUCKET = "treinamentos-anexos";

// Mantém só caracteres seguros no nome do arquivo dentro do path do bucket
// (o nome original, sem sanitizar, continua guardado em arquivo_nome para
// exibição — só o path físico no storage precisa ser "limpo").
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

// Devolve uma URL assinada e temporária pro anexo — o bucket é privado
// (sem policy pública), então o front-end nunca lê o Storage direto, sempre
// passa por aqui pra pegar um link de curta duração (60s, só o necessário
// pra abrir/baixar).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("documentos", "ver");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: treino, error: fetchError } = await admin
    .from("treinamentos")
    .select("arquivo_path, arquivo_nome")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!treino || !treino.arquivo_path) {
    return NextResponse.json({ error: "Nenhum arquivo anexado." }, { status: 404 });
  }

  const { data: signed, error: signError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(treino.arquivo_path, 60, { download: treino.arquivo_nome || true });
  if (signError || !signed) {
    return NextResponse.json({ error: signError?.message || "Falha ao gerar link do anexo." }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl, nome: treino.arquivo_nome });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("documentos", "editar");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

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
    return NextResponse.json({ error: "Arquivo muito grande (máx. 5MB)." }, { status: 400 });
  }

  const originalName = "name" in file && typeof (file as any).name === "string" ? (file as any).name : "arquivo";

  const admin = supabaseAdmin();

  const { data: before, error: fetchError } = await admin
    .from("treinamentos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: "Treinamento/documento não encontrado." }, { status: 404 });
  }

  // Substituir um anexo existente: remove o arquivo antigo antes de subir o
  // novo. Best-effort — se a remoção falhar, seguimos mesmo assim (upsert
  // false garante que não sobrescrevemos silenciosamente nada no bucket).
  if (before.arquivo_path) {
    const { error: removeError } = await admin.storage.from(BUCKET).remove([before.arquivo_path]);
    if (removeError) {
      console.error(`Falha ao remover anexo anterior ${before.arquivo_path}:`, removeError.message);
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `${id}/${Date.now()}-${sanitizeFilename(originalName)}`;

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: after, error: updateError } = await admin
    .from("treinamentos")
    .update({ arquivo_path: path, arquivo_nome: originalName })
    .eq("id", id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await auditDiffFields({
    entidade: "treinamento",
    entidadeId: id,
    entidadeLabel: `${after.tipo} — ${after.pessoa_nome}`,
    before,
    after,
    campos: ["arquivo_nome"],
    usuario: gate.user,
  });

  return NextResponse.json(after);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("documentos", "editar");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: before, error: fetchError } = await admin
    .from("treinamentos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!before || !before.arquivo_path) {
    return NextResponse.json({ error: "Nenhum arquivo para remover." }, { status: 404 });
  }

  const { error: removeError } = await admin.storage.from(BUCKET).remove([before.arquivo_path]);
  if (removeError) {
    console.error(`Falha ao remover anexo ${before.arquivo_path}:`, removeError.message);
  }

  const { data: after, error: updateError } = await admin
    .from("treinamentos")
    .update({ arquivo_path: null, arquivo_nome: null })
    .eq("id", id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await auditDiffFields({
    entidade: "treinamento",
    entidadeId: id,
    entidadeLabel: `${after.tipo} — ${after.pessoa_nome}`,
    before,
    after,
    campos: ["arquivo_nome"],
    usuario: gate.user,
  });

  return NextResponse.json(after);
}
