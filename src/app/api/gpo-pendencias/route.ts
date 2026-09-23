import { NextResponse } from "next/server";
import { requireView } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Fila de fichas de EPI regeneradas (CA corrigido após auditoria) que ainda
// precisam ser subidas manualmente no GPO (sistema do cliente) — o GPO só
// tem sincronização de LEITURA (ver src/lib/gpoSync.ts); não existe upload
// automatizado, por isso essa etapa fica sob confirmação manual de alguém.
// Usada pelo indicador do Painel.
export async function GET(req: Request) {
  const gate = await requireView("painel");
  if (gate.response) return gate.response;

  const url = new URL(req.url);
  const regularizadoParam = url.searchParams.get("regularizado");

  const admin = supabaseAdmin();
  let query = admin.from("gpo_pendencias").select("*").order("criado_em", { ascending: false });
  if (regularizadoParam === "false") query = query.eq("regularizado", false);
  if (regularizadoParam === "true") query = query.eq("regularizado", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data || [] });
}
