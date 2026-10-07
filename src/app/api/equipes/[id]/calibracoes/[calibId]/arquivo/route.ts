import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import * as storage from "@/lib/magaluStorage";

// Mesmo limite e padrão de src/app/api/treinamentos/[id]/arquivo/route.ts —
// bucket privado, front-end nunca acessa o Storage direto, só via URL
// assinada de curta duração gerada aqui.
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

export async function GET(_req: Request, context: { params: Promise<{ id: string; calibId: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("equipes", "ver");
  if (gate.response) return gate.response;

  const equipeId = Number(params.id);
  const calibId = Number(params.calibId);
  if (Number.isNaN(equipeId) || Number.isNaN(calibId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const { data: calib, error } = await supabaseAdmin()
    .from("equipe_calibracoes")
    .select("arquivo_path, arquivo_nome")
    .eq("id", calibId)
    .eq("equipe_id", equipeId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!calib || !calib.arquivo_path) return NextResponse.json({ error: "Nenhum arquivo anexado." }, { status: 404 });

  const { url, error: signError } = await storage.createSignedUrl(calib.arquivo_path, 60, calib.arquivo_nome || true);
  if (signError || !url) {
    return NextResponse.json({ error: signError || "Falha ao gerar link do anexo." }, { status: 500 });
  }

  return NextResponse.json({ url, nome: calib.arquivo_nome });
}

export async function POST(req: Request, context: { params: Promise<{ id: string; calibId: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("equipes", "editar");
  if (gate.response) return gate.response;

  const equipeId = Number(params.id);
  const calibId = Number(params.calibId);
  if (Number.isNaN(equipeId) || Number.isNaN(calibId)) {
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

  const { data: equipe, error: equipeError } = await admin
    .from("equipes")
    .select("id, nome")
    .eq("id", equipeId)
    .maybeSingle();
  if (equipeError) return NextResponse.json({ error: equipeError.message }, { status: 500 });
  if (!equipe) return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });

  const { data: before, error: fetchError } = await admin
    .from("equipe_calibracoes")
    .select("*")
    .eq("id", calibId)
    .eq("equipe_id", equipeId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Registro de calibração não encontrado." }, { status: 404 });

  // Substituir um anexo existente: remove o arquivo antigo antes de subir o
  // novo (best-effort, mesmo padrão dos anexos de treinamentos).
  if (before.arquivo_path) {
    const { error: removeError } = await storage.removeFiles([before.arquivo_path]);
    if (removeError) {
      console.error(`Falha ao remover anexo anterior ${before.arquivo_path}:`, removeError);
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Uma pasta por EQUIPE (não por equipamento) — pedido do Diego — então o
  // nome do equipamento entra no nome do arquivo pra diferenciar dentro da
  // mesma pasta.
  const prefixoEquipamento = before.equipamento.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const path = `${storage.calibracaoFolder(equipeId, equipe.nome)}/${prefixoEquipamento}-${Date.now()}-${sanitizeFilename(originalName)}`;
  const contentType = file.type || "application/octet-stream";

  const { error: uploadError } = await storage.uploadFile(path, buffer, contentType);
  if (uploadError) return NextResponse.json({ error: uploadError }, { status: 500 });

  const { data: after, error: updateError } = await admin
    .from("equipe_calibracoes")
    .update({ arquivo_path: path, arquivo_nome: originalName, atualizado_em: new Date().toISOString() })
    .eq("id", calibId)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabaseAdmin().from("audit_log").insert({
    entidade: "equipe",
    entidade_id: equipeId,
    entidade_label: equipe.nome,
    acao: "editar",
    campo: "calibracao",
    campo_label: `Calibração — ${before.equipamento} (anexo)`,
    de: before.arquivo_nome || null,
    para: originalName,
    usuario_id: gate.user?.id ?? null,
    usuario_nome: gate.user?.nome ?? "—",
  });

  return NextResponse.json(after);
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string; calibId: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("equipes", "editar");
  if (gate.response) return gate.response;

  const equipeId = Number(params.id);
  const calibId = Number(params.calibId);
  if (Number.isNaN(equipeId) || Number.isNaN(calibId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: equipe, error: equipeError } = await admin
    .from("equipes")
    .select("id, nome")
    .eq("id", equipeId)
    .maybeSingle();
  if (equipeError) return NextResponse.json({ error: equipeError.message }, { status: 500 });

  const { data: before, error: fetchError } = await admin
    .from("equipe_calibracoes")
    .select("*")
    .eq("id", calibId)
    .eq("equipe_id", equipeId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!before || !before.arquivo_path) {
    return NextResponse.json({ error: "Nenhum arquivo para remover." }, { status: 404 });
  }

  const { error: removeError } = await storage.removeFiles([before.arquivo_path]);
  if (removeError) {
    console.error(`Falha ao remover anexo ${before.arquivo_path}:`, removeError);
  }

  const { data: after, error: updateError } = await admin
    .from("equipe_calibracoes")
    .update({ arquivo_path: null, arquivo_nome: null, atualizado_em: new Date().toISOString() })
    .eq("id", calibId)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabaseAdmin().from("audit_log").insert({
    entidade: "equipe",
    entidade_id: equipeId,
    entidade_label: equipe?.nome || "",
    acao: "editar",
    campo: "calibracao",
    campo_label: `Calibração — ${before.equipamento} (anexo)`,
    de: before.arquivo_nome || null,
    para: null,
    usuario_id: gate.user?.id ?? null,
    usuario_nome: gate.user?.nome ?? "—",
  });

  return NextResponse.json(after);
}
