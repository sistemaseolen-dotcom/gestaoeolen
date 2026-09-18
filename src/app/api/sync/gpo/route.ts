import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getCurrentUser, unauthorized } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { processStep, SYNC_STEPS } from "@/lib/gpoSyncSteps";

export const maxDuration = 60;

// Autoriza de duas formas:
//  1) Qualquer usuário logado (clicou em "Sincronizar agora" na página de
//     Sincronização) — pedido do Diego: não é mais restrito a admin, todo
//     mundo pode disparar essa sincronização quando quiser.
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
  return { ok: true, origem: `manual:${user.nome}` };
}

// Cria o registro da sincronização e dispara a primeira etapa (ver
// gpoSyncSteps.ts) — a partir daqui a sincronização inteira roda em segundo
// plano, em várias invocações encadeadas, não mais dentro desta requisição.
// Por isso essa função responde quase na hora: quem chamou (botão
// "Sincronizar agora" ou o cron) só recebe a confirmação de que começou,
// junto do id do registro pra poder acompanhar o andamento pela lista
// (GET desta mesma rota).
async function iniciarSincronizacao(origem: string, origin: string): Promise<NextResponse> {
  const admin = supabaseAdmin();

  // Se uma sincronização anterior tiver sido interrompida no meio (por
  // exemplo, se uma etapa falhar em disparar a próxima), a linha dela fica
  // "em_andamento" pra sempre, mesmo já morta de verdade. Pedido do Diego:
  // ao iniciar uma nova sincronização, qualquer linha anterior ainda
  // "em_andamento" é marcada como cancelada antes de começar — assim a
  // tabela nunca acumula várias linhas "em andamento" que na prática já
  // pararam de rodar.
  await admin
    .from("sync_log")
    .update({
      status: "erro",
      concluido_em: new Date().toISOString(),
      erro: "Cancelado: uma nova sincronização foi iniciada antes desta terminar.",
    })
    .eq("status", "em_andamento");

  const { data: logRow } = await admin
    .from("sync_log")
    .insert({ status: "em_andamento", origem })
    .select()
    .single();

  if (!logRow) {
    return NextResponse.json({ ok: false, error: "Falha ao registrar o início da sincronização." }, { status: 500 });
  }

  waitUntil(processStep(logRow.id, SYNC_STEPS[0], origin));

  return NextResponse.json({ ok: true, iniciado: true, logId: logRow.id });
}

// POST: botão "Sincronizar agora" (qualquer usuário logado).
export async function POST(req: Request) {
  const auth = await checkAuth(req);
  if (!auth.ok) return auth.response;
  return iniciarSincronizacao(auth.origem, new URL(req.url).origin);
}

// GET: o Vercel Cron só faz requisições GET, então é aqui que a
// sincronização diária automática entra (com o header do CRON_SECRET). Sem
// esse header, GET vira uma consulta às últimas sincronizações (pra exibir
// na página de Sincronização, acessível a qualquer usuário logado).
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return iniciarSincronizacao("cron", new URL(req.url).origin);
  }

  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("sync_log")
    .select("id, iniciado_em, concluido_em, status, origem, resumo, erro")
    .order("iniciado_em", { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data || [] });
}
