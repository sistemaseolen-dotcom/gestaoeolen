import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Config do projeto Supabase SEPARADO de "Gestão de Frotas" (tb_viagem) —
// mesma chave pública anon já usada em src/app/api/frotas-reports/route.ts
// (ver comentário lá pra contexto completo). Centralizada aqui porque agora
// dois lugares precisam falar com ela: a tela de Reports E a sincronização
// automática do Histórico de Kilometragem abaixo.
const FROTAS_SUPABASE_URL = "https://ojwsnupgvgixlngxdfyg.supabase.co";
const FROTAS_SUPABASE_ANON_KEY = "sb_publishable_9JFzluB1CHAA-PP3exopTQ_CKYkGW2r";

export async function frotasGet(path: string): Promise<any[]> {
  const all: any[] = [];
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const res = await fetch(`${FROTAS_SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: FROTAS_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${FROTAS_SUPABASE_ANON_KEY}`,
        Range: `${offset}-${offset + pageSize - 1}`,
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Falha ao buscar dados do projeto Gestão de Frotas (HTTP ${res.status}).`);
    const page = await res.json();
    all.push(...page);
    if (!Array.isArray(page) || page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

export function toDateOnlyBR(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(isoTimestamp));
}

type FrotaReport = {
  id: number;
  placa: string;
  data: string;
  km: number;
  motorista: string;
  contrato: string;
};

async function fetchFrotaReportsComId(): Promise<FrotaReport[]> {
  const viagens = await frotasGet(
    "tb_viagem?select=id,placa,data_criacao,hodometro,id_usuario,tb_usuario(nome),tb_veiculo(contrato)&ativo=eq.1&order=data_criacao.desc"
  );
  return viagens.map((v: any) => ({
    id: Number(v.id),
    placa: v.placa || "",
    data: toDateOnlyBR(v.data_criacao),
    km: Number(v.hodometro) || 0,
    motorista: (v.tb_usuario && v.tb_usuario.nome) || "",
    contrato: (v.tb_veiculo && v.tb_veiculo.contrato) || "",
  }));
}

// Mesma regra de alerta de hodômetro já usada na tela de Reports
// (computeAlertasFrota em public/app.js, ajustada pelo Diego em 06/10/2026)
// -- precisa ficar IDÊNTICA a essa, senão a sincronização discordaria da
// tela sobre o que tem alerta. "menor" é fisicamente impossível (hodômetro
// nunca diminui, sem limite de dias); "salto" é mais de 7.000km de
// diferença pro report anterior da MESMA placa em até 7 dias (diferença
// maior com intervalo maior é esperada -- motorista ficou um tempo sem
// reportar -- e não gera alerta).
const ALERTA_KM_EXORBITANTE_LIMIAR = 7000;
const ALERTA_KM_EXORBITANTE_DIAS = 7;

function idsComAlerta(reports: FrotaReport[]): Set<number> {
  const byPlaca = new Map<string, FrotaReport[]>();
  for (const r of reports) {
    if (!byPlaca.has(r.placa)) byPlaca.set(r.placa, []);
    byPlaca.get(r.placa)!.push(r);
  }
  const alertados = new Set<number>();
  for (const list of byPlaca.values()) {
    list.sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    for (let i = 1; i < list.length; i++) {
      const atual = list[i];
      const anterior = list[i - 1];
      const diferenca = atual.km - anterior.km;
      const dias = Math.round(
        Math.max(0, (new Date(atual.data).getTime() - new Date(anterior.data).getTime()) / 86400000)
      );
      if (atual.km < anterior.km) alertados.add(atual.id);
      else if (diferenca > ALERTA_KM_EXORBITANTE_LIMIAR && dias <= ALERTA_KM_EXORBITANTE_DIAS) alertados.add(atual.id);
    }
  }
  return alertados;
}

// Resolve placa -> id do veículo em STATE.veiculos: prioriza o que está
// "EM USO" hoje; sem nenhum ativo, pega o mais recente (maior data de
// contrato/retirada) -- mesmo critério usado em todo lugar que já lida com
// troca de placa dentro de um contrato (ver computeKmExcedidoPorContratoFrota
// em public/app.js).
async function resolverVeiculoIdPorPlaca(
  admin: ReturnType<typeof supabaseAdmin>,
  placas: string[]
): Promise<Map<string, number>> {
  if (!placas.length) return new Map();
  const { data, error } = await admin
    .from("veiculos")
    .select("id, placa, status, data_contrato, data_retirada")
    .in("placa", placas);
  if (error) throw error;

  const porPlaca = new Map<string, any[]>();
  (data || []).forEach((v: any) => {
    if (!v.placa) return;
    if (!porPlaca.has(v.placa)) porPlaca.set(v.placa, []);
    porPlaca.get(v.placa)!.push(v);
  });

  const resultado = new Map<string, number>();
  porPlaca.forEach((lista, placa) => {
    const ativo = lista.find((v) => String(v.status || "").toUpperCase().trim() === "EM USO");
    const escolhido =
      ativo ||
      lista
        .slice()
        .sort((a, b) => (b.data_contrato || b.data_retirada || "").localeCompare(a.data_contrato || a.data_retirada || ""))[0];
    if (escolhido) resultado.set(placa, escolhido.id);
  });
  return resultado;
}

export type SincronizarKmRelatoriosResultado = {
  executadoEm: string;
  totalReports: number;
  comAlerta: number;
  semAlerta: number;
  sincronizados: number;
  removidos: number;
  semVeiculoCorrespondente: { placa: string; contrato: string; data: string }[];
};

// Núcleo da implantação pedida pelo Diego (10/2026): os reports semanais de
// KM enviados pelos motoristas (tb_viagem, projeto Supabase separado) agora
// alimentam automaticamente o Histórico de Kilometragem do Contrato (tabela
// veiculo_km_lancamentos) -- COM a ressalva que ele pediu: um report com
// alerta de hodômetro ("menor" ou "salto", ver idsComAlerta acima) NUNCA
// sobe, e só sobe depois que o alerta some (corrigido, ou substituído por
// outro report sem alerta).
//
// Fica também "autocurativo": toda chamada recalcula do zero quais reports
// estão sem alerta HOJE e sincroniza exatamente esse conjunto -- um
// lançamento que subiu antes mas cujo report de origem passou a ter alerta
// (ou foi desativado/removido na origem) é removido daqui também. Dedup e
// atualização usam `relatorio_viagem_id` (upsert) -- nunca duplica, e se o
// motorista corrigir o KM de um report já sincronizado, o valor aqui
// acompanha.
//
// Chamada por duas portas: o botão "Sincronizar KM" na tela de Reports
// (POST /api/veiculos/sincronizar-km-relatorios, com permissão) e a tarefa
// agendada diária às 17h (GET /api/cron/sincronizar-km-relatorios, ver
// vercel.json) -- mesma função, mesmo resultado, só muda quem chama.
export async function sincronizarKmRelatorios(): Promise<SincronizarKmRelatoriosResultado> {
  const admin = supabaseAdmin();

  const reports = await fetchFrotaReportsComId();
  const alertados = idsComAlerta(reports);
  // km<=0 ou sem data/placa não é um report utilizável (dado incompleto na
  // origem) -- fora do escopo do alerta de hodômetro, mas igualmente não
  // deve subir pro Histórico.
  const validos = reports.filter((r) => r.km > 0 && !!r.data && !!r.placa && !alertados.has(r.id));

  const placas = Array.from(new Set(reports.map((r) => r.placa).filter(Boolean)));
  const veiculoIdPorPlaca = await resolverVeiculoIdPorPlaca(admin, placas);

  const semVeiculo: FrotaReport[] = [];
  const linhas: any[] = [];
  for (const r of validos) {
    const veiculoId = veiculoIdPorPlaca.get(r.placa);
    if (!veiculoId) {
      semVeiculo.push(r);
      continue;
    }
    linhas.push({
      veiculo_id: veiculoId,
      data_lancamento: r.data,
      km: r.km,
      responsavel_nome: (r.motorista || "").toUpperCase() || null,
      origem: "relatorio",
      legacy_id: null,
      relatorio_viagem_id: r.id,
    });
  }

  // Upsert em lotes (não um insert por vez) -- com milhares de reports isso
  // evita estourar o tempo de execução da função serverless.
  const LOTE = 500;
  let sincronizados = 0;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    const { error } = await admin.from("veiculo_km_lancamentos").upsert(lote, { onConflict: "relatorio_viagem_id" });
    if (error) throw error;
    sincronizados += lote.length;
  }

  // Autolimpeza: remove lançamentos de origem "relatorio" cujo report não
  // está mais no conjunto válido de hoje (passou a ter alerta, ou sumiu/foi
  // desativado na origem).
  const idsValidosDoReport = new Set(linhas.map((l) => l.relatorio_viagem_id));
  const { data: existentes, error: existentesError } = await admin
    .from("veiculo_km_lancamentos")
    .select("id, relatorio_viagem_id")
    .eq("origem", "relatorio")
    .not("relatorio_viagem_id", "is", null);
  if (existentesError) throw existentesError;
  const idsParaRemover = (existentes || [])
    .filter((row: any) => !idsValidosDoReport.has(row.relatorio_viagem_id))
    .map((row: any) => row.id);

  let removidos = 0;
  for (let i = 0; i < idsParaRemover.length; i += LOTE) {
    const lote = idsParaRemover.slice(i, i + LOTE);
    const { error } = await admin.from("veiculo_km_lancamentos").delete().in("id", lote);
    if (error) throw error;
    removidos += lote.length;
  }

  const resultado: SincronizarKmRelatoriosResultado = {
    executadoEm: new Date().toISOString(),
    totalReports: reports.length,
    comAlerta: alertados.size,
    semAlerta: validos.length,
    sincronizados,
    removidos,
    semVeiculoCorrespondente: semVeiculo.map((r) => ({ placa: r.placa, contrato: r.contrato, data: r.data })),
  };

  // Guarda o resultado da última execução em `configuracoes` pra tela de
  // Reports mostrar "última sincronização" sem precisar rodar de novo.
  await admin
    .from("configuracoes")
    .upsert({ chave: "km_relatorios_sync_status", valor: resultado, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });

  return resultado;
}
