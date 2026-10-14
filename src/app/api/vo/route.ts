import { NextResponse } from "next/server";
import { requireView } from "@/lib/authGuard";
import { bqQuery } from "@/lib/bigquery";

// Controle de VO (pedido do Diego, 14/10/2026): lista de todas as VOs
// (POs adicionais da Huawei) da view esupplier.vw_vo_change, só com as
// colunas que a tela de lista/painel usa, mais a última carga registrada em
// log.vw_log_esuplier_vochange. Somente leitura — o sistema nunca escreve no
// BigQuery. Todos que têm "ver" na página "vo" enxergam todas as VOs.
//
// Cache em memória (por instância do servidor) de 5 minutos: a base só muda
// quando o job de extração roda, então não faz sentido consultar o BigQuery
// a cada clique. ?refresh=1 força uma nova leitura.

export const dynamic = "force-dynamic";

const VO_VIEW = "`dw-eolen-413717.esupplier.vw_vo_change`";
const LOG_VIEW = "`dw-eolen-413717.log.vw_log_esuplier_vochange`";
const CACHE_MS = 5 * 60 * 1000;

let cache: { at: number; payload: unknown } | null = null;

const SQL_VOS = `
SELECT
  VOChangeNo AS \`no\`,  -- "no" é palavra reservada no BigQuery
  VOChangeName AS nome,
  ProjectName AS projeto,
  DeliveryRegionName AS regiao,
  SiteID AS site,
  DUName AS du,
  ItemName AS item,
  QtyAfterChange AS qtd,
  Unit AS unidade,
  ChangeReason AS motivo,
  CurrentStatus AS status,
  CurrentApprovalRole AS papel,
  CAST(SubmittedOn AS STRING) AS submetida,
  SubmittedBy AS submetidoPor,
  TaskEndDate AS prazo,
  PRNoNew AS prNova,
  PONoNew AS poNova,
  REGEXP_EXTRACT(OperationLog, r'Operation Time:([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2})') AS ultimaOperacao
FROM ${VO_VIEW}`;

const SQL_LOG = `
SELECT dados, data_atualizacao, plataforma, status, data_execucao_job_log, horario_extracao
FROM ${LOG_VIEW}`;

export async function GET(req: Request) {
  const gate = await requireView("vo");
  if (gate.response) return gate.response;

  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  if (!refresh && cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.payload);
  }

  try {
    const [vos, log] = await Promise.all([bqQuery(SQL_VOS), bqQuery(SQL_LOG)]);
    const payload = { vos, log, lidoEm: new Date().toISOString() };
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao ler o BigQuery.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
