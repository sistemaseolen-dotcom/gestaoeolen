import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { processStep, isSyncStep } from "@/lib/gpoSyncSteps";

export const maxDuration = 60;

// Rota de uso EXCLUSIVAMENTE interno: uma etapa da sincronização chamando a
// próxima (ver gpoSyncSteps.ts). Nunca é chamada pelo navegador — por isso
// não usa login de usuário, só um segredo compartilhado (o mesmo
// CRON_SECRET já usado pelo Vercel Cron).
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("x-sync-secret");
  if (!secret || header !== secret) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const step = body?.step;
  const logId = Number(body?.logId);
  // `offset` só é usado pela etapa paginada "patrimonio_historico" (ver
  // gpoSyncSteps.ts) — nas demais etapas vem 0 e é ignorado.
  const offset = Number.isFinite(Number(body?.offset)) ? Number(body?.offset) : 0;
  if (!isSyncStep(step) || !Number.isFinite(logId)) {
    return NextResponse.json({ ok: false, error: "Parâmetros inválidos." }, { status: 400 });
  }

  const origin = new URL(req.url).origin;

  // Responde na hora; o trabalho de verdade dessa etapa (e o disparo da
  // etapa seguinte) roda em segundo plano.
  waitUntil(processStep(logId, step, origin, offset));

  return NextResponse.json({ ok: true, started: step });
}
