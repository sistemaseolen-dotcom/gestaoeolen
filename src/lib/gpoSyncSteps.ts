// Orquestração da sincronização com o GPO, dividida em etapas — ver o
// comentário no lugar de `syncFromGpo` em gpoSync.ts pra entender o motivo:
// as 5 etapas juntas passaram a demorar mais que os 60s do plano Hobby da
// Vercel (GPO respondendo mais lento do que antes).
//
// Solução: cada etapa roda como sua PRÓPRIA invocação da função, com seus
// próprios 60s — a rota /api/sync/gpo/step (ver route.ts ao lado) recebe
// "rode a etapa X do registro Y" e, ao terminar essa etapa, ela mesma
// dispara a próxima etapa (chamando a si mesma via HTTP) em vez de tudo
// rodar dentro de uma função só. Isso é feito em segundo plano (waitUntil
// do pacote @vercel/functions): a rota responde na hora pra quem chamou
// (o botão "Sincronizar agora", o cron, ou a etapa anterior), e só então o
// trabalho de verdade (e o disparo da etapa seguinte) continua rodando —
// senão quem chamou ficaria esperando a etapa (e a cadeia inteira, se
// esperasse a resposta de cada disparo até o fim) terminar, voltando pro
// mesmo problema de estourar 60s.
import { supabaseAdmin } from "./supabaseAdmin";
import { syncEmpresas, syncPessoas, syncEquipes, syncTreinamentos, syncPatrimonios } from "./gpoSync";

export const SYNC_STEPS = ["empresas", "pessoas", "equipes", "treinamentos", "patrimonio"] as const;
export type SyncStep = (typeof SYNC_STEPS)[number];

export function isSyncStep(v: unknown): v is SyncStep {
  return typeof v === "string" && (SYNC_STEPS as readonly string[]).includes(v);
}

const STEP_FN: Record<SyncStep, () => Promise<unknown>> = {
  empresas: syncEmpresas,
  pessoas: syncPessoas,
  equipes: syncEquipes,
  treinamentos: syncTreinamentos,
  patrimonio: syncPatrimonios,
};

// Roda UMA etapa da sincronização (identificada por `logId` + `step`) e, ao
// terminar, decide o que vem a seguir: dispara a próxima etapa, ou — se essa
// era a última — marca o registro como concluído. Qualquer erro (na etapa em
// si, ou ao disparar a próxima) marca o registro como erro na hora, em vez
// de deixá-lo "em_andamento" esperando a próxima sincronização limpar.
export async function processStep(logId: number, step: SyncStep, origin: string): Promise<void> {
  const admin = supabaseAdmin();
  try {
    const resultado = await STEP_FN[step]();

    // Só uma etapa por vez roda pra cada `logId` (a cadeia é sequencial),
    // então não há concorrência escrevendo em `resumo` ao mesmo tempo — dá
    // pra ler, mesclar e gravar de volta sem se preocupar em perder escrita.
    const { data: row } = await admin.from("sync_log").select("resumo").eq("id", logId).single();
    const resumo = { ...(((row?.resumo as Record<string, unknown>) || {})), [step]: resultado };
    await admin.from("sync_log").update({ resumo }).eq("id", logId);

    const proximo = SYNC_STEPS[SYNC_STEPS.indexOf(step) + 1];
    if (proximo) {
      await dispararEtapa(logId, proximo, origin);
    } else {
      await admin
        .from("sync_log")
        .update({ status: "sucesso", concluido_em: new Date().toISOString() })
        .eq("id", logId);
    }
  } catch (err: any) {
    const mensagem = err?.message || "Erro desconhecido na sincronização.";
    await admin
      .from("sync_log")
      .update({
        status: "erro",
        concluido_em: new Date().toISOString(),
        erro: `Falhou na etapa "${step}": ${mensagem}`,
      })
      .eq("id", logId);
  }
}

// Chama a rota interna que roda a próxima etapa. Fica AWAITED aqui dentro
// (mesmo sem usar o corpo da resposta) porque essa chamada só tem garantia
// de realmente saír pela rede enquanto ESTA função (processStep) ainda
// estiver "viva" pro waitUntil que a envolve lá na rota — e ela só continua
// viva enquanto houver uma Promise pendente sendo observada. A rota de
// destino responde rápido (ela também só enfileira o trabalho pesado dela
// em segundo plano), então esse await não fica esperando a etapa seguinte
// terminar — só confirma que o pedido de fato saiu.
async function dispararEtapa(logId: number, step: SyncStep, origin: string): Promise<void> {
  const secret = process.env.CRON_SECRET || "";
  const res = await fetch(`${origin}/api/sync/gpo/step`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-sync-secret": secret },
    body: JSON.stringify({ logId, step }),
  });
  if (!res.ok) {
    throw new Error(`Falha ao disparar a etapa "${step}" (HTTP ${res.status})`);
  }
}
