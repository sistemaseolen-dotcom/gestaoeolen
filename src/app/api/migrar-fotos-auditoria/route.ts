import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

// Rota TEMPORÁRIA, uso único: migra as fotos das 6 auditorias reais do
// audit-app-v2 (projeto Supabase antigo) pro bucket novo do Controle Eolen.
// Depois de confirmado que tudo migrou certo, este arquivo deve ser
// removido (e a variável AUDIT_APP_SUPABASE_SERVICE_ROLE_KEY, apagada da
// Vercel) — não é pra ficar em produção.
//
// Processa UMA auditoria por chamada (?auditoriaId=<id do Controle Eolen>),
// pra não estourar o tempo limite da função com as ~30 fotos de cada uma.
// Idempotente: se a auditoria já tem fotos migradas, pula sem duplicar.

const OLD_SUPABASE_URL = "https://xlyshilnabjbosbemwju.supabase.co";
const OLD_BUCKET = "audit-files";
const NEW_BUCKET = "auditorias-anexos";

function oldAdmin() {
  const key = process.env.AUDIT_APP_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("AUDIT_APP_SUPABASE_SERVICE_ROLE_KEY não configurada.");
  }
  return createClient(OLD_SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function extensaoDe(path: string): string {
  const m = /\.[a-zA-Z0-9]+$/.exec(path);
  return m ? m[0] : ".jpg";
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();

  const url = new URL(req.url);
  const auditoriaId = Number(url.searchParams.get("auditoriaId"));
  if (!Number.isFinite(auditoriaId)) {
    return NextResponse.json({ error: "Informe ?auditoriaId=<id>." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: auditoria, error: auditoriaError } = await admin
    .from("auditorias")
    .select("id, legacy_id, site_id")
    .eq("id", auditoriaId)
    .maybeSingle();
  if (auditoriaError) return NextResponse.json({ error: auditoriaError.message }, { status: 500 });
  if (!auditoria) return NextResponse.json({ error: "Auditoria não encontrada." }, { status: 404 });
  if (!auditoria.legacy_id) {
    return NextResponse.json({ error: "Esta auditoria não veio do app antigo (sem legacy_id)." }, { status: 400 });
  }

  // Idempotência: se já tem fotos, não migra de novo.
  const { count: jaExistem, error: countError } = await admin
    .from("auditoria_fotos")
    .select("id", { count: "exact", head: true })
    .eq("auditoria_id", auditoriaId);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  if (jaExistem && jaExistem > 0) {
    return NextResponse.json({ ok: true, skipped: true, motivo: "Já tinha fotos migradas.", jaExistem });
  }

  const old = oldAdmin();

  const { data: fotosAntigas, error: fotosError } = await old
    .from("photos")
    .select("id, slot_key, label, comment, file_path, sort_order")
    .eq("audit_id", auditoria.legacy_id)
    .order("sort_order", { ascending: true });
  if (fotosError) return NextResponse.json({ error: `Falha lendo fotos antigas: ${fotosError.message}` }, { status: 500 });
  if (!fotosAntigas || fotosAntigas.length === 0) {
    return NextResponse.json({ ok: true, migradas: 0, motivo: "Nenhuma foto encontrada no app antigo para esta auditoria." });
  }

  const resultados: any[] = [];

  for (const foto of fotosAntigas) {
    try {
      const { data: blob, error: downloadError } = await old.storage.from(OLD_BUCKET).download(foto.file_path);
      if (downloadError || !blob) {
        resultados.push({ slot_key: foto.slot_key, ok: false, erro: downloadError?.message || "download vazio" });
        continue;
      }

      const buffer = Buffer.from(await blob.arrayBuffer());
      const novoPath = `${auditoriaId}/${foto.slot_key}${extensaoDe(foto.file_path)}`;
      const contentType = blob.type || "image/jpeg";

      const { error: uploadError } = await admin.storage.from(NEW_BUCKET).upload(novoPath, buffer, {
        contentType,
        upsert: true,
      });
      if (uploadError) {
        resultados.push({ slot_key: foto.slot_key, ok: false, erro: uploadError.message });
        continue;
      }

      const { error: insertError } = await admin.from("auditoria_fotos").insert({
        auditoria_id: auditoriaId,
        slot_key: foto.slot_key,
        label: foto.label,
        comentario: foto.comment,
        arquivo_path: novoPath,
        sort_order: foto.sort_order,
      });
      if (insertError) {
        resultados.push({ slot_key: foto.slot_key, ok: false, erro: insertError.message });
        continue;
      }

      resultados.push({ slot_key: foto.slot_key, ok: true, bytes: buffer.byteLength });
    } catch (err: any) {
      resultados.push({ slot_key: foto.slot_key, ok: false, erro: err?.message || String(err) });
    }
  }

  const migradas = resultados.filter((r) => r.ok).length;
  const falhas = resultados.filter((r) => !r.ok);

  return NextResponse.json({
    ok: falhas.length === 0,
    auditoria: auditoria.site_id,
    total: fotosAntigas.length,
    migradas,
    falhas,
    detalhes: resultados,
  });
}
