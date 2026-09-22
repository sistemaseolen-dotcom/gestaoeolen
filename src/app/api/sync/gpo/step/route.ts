import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getCurrentUser, unauthorized } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { processStep, isSyncStep } from "@/lib/gpoSyncSteps";

export const maxDuration = 60;

// Antes, essa rota era chamada só internamente (função->função da própria
// Vercel, com um segredo compartilhado). Isso passou a tropeçar num limite
// não documentado da Vercel (~4 chamadas encadeadas desse tipo — ver o
// comentário grande em gpoSyncSteps.ts), então agora quem dispara cada
// etapa (depois da primeira) é o navegador de quem está com a tela de
// Sincronização aberta — por isso a rota também aceita sessão de usuário
// logado, e não só o segredo do cron.
async function checkAuth(req: Request): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("x-sync-secret");
  if (secret && header === secret) return { ok: true };

  const user = await getCurrentUser();
  if (!user) return { ok: false, response: unauthorized() };
  return { ok: true };
}

export async function POST(req: Request) {
  const auth = await checkAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const step = body?.step;
  const logId = Number(body?.logId);
  // `offset` só é usado pela etapa paginada "patrimonio_historico" (ver
  // gpoSyncSteps.ts) — nas demais etapas vem 0 e é ignorado.
  const offset = Number.isFinite(Number(body?.offset)) ? Number(body?.offset) : 0;
  if (!isSyncStep(step) || !Number.isFinite(logId)) {
    return NextResponse.json({ ok: false, error: "Parâmetros inválidos." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: row } = await admin.from("sync_log").select("status, resumo").eq("id", logId).single();

  // Defesa contra disparo duplicado: se duas abas estiverem com a tela
  // aberta (ou o navegador disparar duas vezes antes do banco atualizar), só
  // segue quem pediu exatamente a etapa/offset que o registro está esperando
  // agora — o outro pedido é ignorado silenciosamente (não é erro, só
  // redundante).
  if (!row || row.status !== "em_andamento") {
    return NextResponse.json({ ok: true, skipped: true, motivo: "Sincronização não está mais em andamento." });
  }
  const resumo = (row.resumo as Record<string, unknown>) || {};
  const esperada = resumo._proximaEtapa;
  const esperadoOffset = Number(resumo._proximaOffset) || 0;
  // A primeira etapa (disparada pela própria rota que inicia a
  // sincronização, não pelo navegador) não grava `_proximaEtapa` antes de
  // rodar — por isso só aplica a checagem quando já existe alguma etapa
  // marcada como esperada no registro.
  if (esperada !== undefined && (esperada !== step || esperadoOffset !== offset)) {
    return NextResponse.json({ ok: true, skipped: true, motivo: "Essa etapa já foi disparada ou a sincronização avançou." });
  }

  // Responde na hora; o trabalho de verdade dessa etapa roda em segundo
  // plano.
  waitUntil(processStep(logId, step, offset));

  return NextResponse.json({ ok: true, started: step });
}
