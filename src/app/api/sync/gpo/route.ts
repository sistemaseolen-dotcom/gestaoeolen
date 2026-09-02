import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncFromGpo } from "@/lib/gpoSync";

export const maxDuration = 60;

// Autoriza de duas formas:
//  1) Usuário admin logado (clicou em "Sincronizar agora" no painel).
//  2) Header Authorization: Bearer <CRON_SECRET> — usado pelo Vercel Cron
//     (ver vercel.json) pra rodar a sincronização diária sem sessão.
async function checkAuth(req: Request): Promise<{ ok: true; origem: string } | { ok: false; response: NextResponse }> {
  const authHeader = req.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true, origem: "cron" };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, response: unauthorized() };
  if (user.role !== "admin") return { ok: false, response: forbidden() };
  return { ok: true, origem: `manual:${user.nome}` };
}

async function runAndLog(origem: string) {
  const admin = supabaseAdmin();
  const { data: logRow } = await admin
    .from("sync_log")
    .insert({ status: "em_andamento", origem })
    .select()
    .single();

  try {
    const resumo = await syncFromGpo();
    if (logRow) {
      await admin
        .from("sync_log")
        .update({ status: "sucesso", concluido_em: new Date().toISOString(), resumo })
        .eq("id", logRow.id);
    }
    return NextResponse.json({ ok: true, resumo });
  } catch (err: any) {
    const mensagem = err?.message || "Erro desconhecido na sincronização.";
    if (logRow) {
      await admin
        .from("sync_log")
        .update({ status: "erro", concluido_em: new Date().toISOString(), erro: mensagem })
        .eq("id", logRow.id);
    }
    return NextResponse.json({ ok: false, error: mensagem }, { status: 500 });
  }
}

// POST: botão "Sincronizar agora" (admin logado).
export async function POST(req: Request) {
  const auth = await checkAuth(req);
  if (!auth.ok) return auth.response;
  return runAndLog(auth.origem);
}

// GET: o Vercel Cron só faz requisições GET, então é aqui que a
// sincronização diária automática entra (com o header do CRON_SECRET). Sem
// esse header, GET vira uma consulta às últimas sincronizações (pra exibir
// no painel de admin).
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return runAndLog("cron");
  }

  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("sync_log")
    .select("id, iniciado_em, concluido_em, status, origem, resumo, erro")
    .order("iniciado_em", { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data || [] });
}
