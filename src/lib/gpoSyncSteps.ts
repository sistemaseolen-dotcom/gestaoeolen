// Orquestração da sincronização com o GPO, dividida em etapas — ver o
// comentário no lugar de `syncFromGpo` em gpoSync.ts pra entender o motivo:
// as etapas juntas passaram a demorar mais que os 60s do plano Hobby da
// Vercel (GPO respondendo mais lento do que antes).
//
// Solução: cada etapa roda como sua PRÓPRIA invocação da função, com seus
// próprios 60s — a rota /api/sync/gpo/step (ver route.ts ao lado) recebe
// "rode a etapa X do registro Y" e, ao terminar essa etapa, grava no
// registro (`sync_log.resumo._proximaEtapa` / `_proximaOffset`) qual é a
// etapa seguinte, SEM disparar nada sozinha.
//
// Isso é proposital, não uma limitação: cada etapa que chamava a próxima
// (função->função, dentro da própria Vercel) diretamente por HTTP tropeçava
// num limite interno da Vercel — não documentado — de aproximadamente 4
// chamadas encadeadas desse tipo em sequência; a 5ª sempre voltava
// "508 Loop Detected" antes até de chegar no nosso código (confirmado pelos
// logs: nenhum log de aplicação pra essa chamada). Retry não resolve, porque
// não é um erro de rede — é a Vercel detectando e bloqueando a cadeia.
//
// Pedido do Diego: em vez de pagar por um plano maior ou depender de um
// serviço externo de fila, a sincronização passa a ser SÓ MANUAL — cada
// etapa é disparada por quem está com a tela de Sincronização aberta (ver
// app.js: o polling que já existia, a cada 4s, agora também dispara a
// próxima etapa quando vê uma pendente). Cada disparo desses é uma
// requisição NOVA vinda do navegador, não uma chamada função->função da
// Vercel — por isso nunca entra na cadeia que estourava o limite. O efeito
// colateral aceito: a sincronização não roda mais sozinha de madrugada (o
// cron em vercel.json foi removido) — precisa da tela aberta até terminar.
import { supabaseAdmin } from "./supabaseAdmin";
import { syncEmpresas, syncPessoas, syncEquipes, syncTreinamentos, syncPatrimonios, syncPatrimoniosHistoricoPagina } from "./gpoSync";

// "patrimonio_historico" é diferente das outras: não roda de uma vez, e sim
// em PÁGINAS (ver syncPatrimoniosHistoricoPagina em gpoSync.ts) — cada
// invocação processa só um pedaço e, se ainda faltar, grava a SI MESMA como
// próxima etapa (com o próximo offset) em vez de avançar pra próxima etapa
// da lista.
export const SYNC_STEPS = ["empresas", "pessoas", "equipes", "treinamentos", "patrimonio", "patrimonio_historico"] as const;
export type SyncStep = (typeof SYNC_STEPS)[number];

// Quantos itens de patrimônio (cada um = 1 requisição ao GPO) processar por
// invocação. Pequeno de propósito: o GPO está lento e cada invocação só tem
// 60s (plano Hobby da Vercel) — melhor sobrar tempo e paginar mais vezes do
// que arriscar estourar de novo.
const PATRIMONIO_HISTORICO_PAGE_SIZE = 150;

export function isSyncStep(v: unknown): v is SyncStep {
  return typeof v === "string" && (SYNC_STEPS as readonly string[]).includes(v);
}

const STEP_FN: Partial<Record<SyncStep, () => Promise<unknown>>> = {
  empresas: syncEmpresas,
  pessoas: syncPessoas,
  equipes: syncEquipes,
  treinamentos: syncTreinamentos,
  patrimonio: syncPatrimonios,
};

type Resumo = Record<string, unknown> & { _proximaEtapa?: SyncStep | null; _proximaOffset?: number };

async function lerResumo(admin: ReturnType<typeof supabaseAdmin>, logId: number): Promise<Resumo> {
  const { data: row } = await admin.from("sync_log").select("resumo").eq("id", logId).single();
  return ((row?.resumo as Resumo) || {}) as Resumo;
}

// Roda UMA etapa da sincronização (identificada por `logId` + `step`) e, ao
// terminar, grava qual é a próxima etapa a rodar (ou marca o registro como
// concluído/erro, se for o caso) — ver o comentário grande no topo do
// arquivo sobre por que isso não dispara mais a próxima etapa sozinho.
export async function processStep(logId: number, step: SyncStep, offset = 0): Promise<void> {
  const admin = supabaseAdmin();
  try {
    if (step === "patrimonio_historico") {
      const pagina = await syncPatrimoniosHistoricoPagina(offset, PATRIMONIO_HISTORICO_PAGE_SIZE);

      // Acumula entre páginas (cada invocação só processa um pedaço) em vez
      // de sobrescrever — senão o resumo final mostraria só a última página.
      const resumoAtual = await lerResumo(admin, logId);
      const acumulado = (resumoAtual.patrimonio_historico as { total: number; erros: number } | undefined) || { total: 0, erros: 0 };
      const resumo: Resumo = {
        ...resumoAtual,
        patrimonio_historico: { total: acumulado.total + pagina.total, erros: acumulado.erros + pagina.erros },
      };

      if (!pagina.done) {
        resumo._proximaEtapa = "patrimonio_historico";
        resumo._proximaOffset = pagina.nextOffset;
        await admin.from("sync_log").update({ resumo }).eq("id", logId);
        return;
      }

      // "patrimonio_historico" é sempre a última etapa da lista.
      resumo._proximaEtapa = null;
      resumo._proximaOffset = 0;
      await admin
        .from("sync_log")
        .update({ status: "sucesso", concluido_em: new Date().toISOString(), resumo })
        .eq("id", logId);
      return;
    }

    const fn = STEP_FN[step];
    if (!fn) throw new Error(`Etapa sem função associada: ${step}`);
    const resultado = await fn();

    // Só uma etapa por vez roda pra cada `logId` (a cadeia é sequencial —
    // quem dispara a próxima só faz isso depois de ver esta terminar),
    // então não há concorrência escrevendo em `resumo` ao mesmo tempo.
    const resumo: Resumo = { ...(await lerResumo(admin, logId)), [step]: resultado };

    const proximo = SYNC_STEPS[SYNC_STEPS.indexOf(step) + 1];
    if (proximo) {
      resumo._proximaEtapa = proximo;
      resumo._proximaOffset = 0;
      await admin.from("sync_log").update({ resumo }).eq("id", logId);
    } else {
      resumo._proximaEtapa = null;
      resumo._proximaOffset = 0;
      await admin
        .from("sync_log")
        .update({ status: "sucesso", concluido_em: new Date().toISOString(), resumo })
        .eq("id", logId);
    }
  } catch (err: any) {
    const mensagem = err?.message || "Erro desconhecido na sincronização.";
    const resumoAtual = await lerResumo(admin, logId).catch(() => ({}) as Resumo);
    await admin
      .from("sync_log")
      .update({
        status: "erro",
        concluido_em: new Date().toISOString(),
        erro: `Falhou na etapa "${step}"${offset ? " (a partir do item " + offset + ")" : ""}: ${mensagem}`,
        resumo: { ...resumoAtual, _proximaEtapa: null, _proximaOffset: 0 },
      })
      .eq("id", logId);
  }
}
