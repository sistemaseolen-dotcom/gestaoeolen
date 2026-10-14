import { createSign } from "crypto";

// Leitura do BigQuery (dw-eolen) direto pela API REST, sem dependência nova
// no package.json: o token OAuth é obtido assinando um JWT com a chave da
// service account (fluxo "JWT bearer" do Google). Usado pelo módulo
// Controle de VO (pedido do Diego, 14/10/2026) para ler as views
// esupplier.vw_vo_change e log.vw_log_esuplier_vochange.
//
// Variável de ambiente (SECRETA, só no servidor — nunca NEXT_PUBLIC_):
//   GCP_SERVICE_ACCOUNT_JSON = conteúdo do arquivo .json da chave da service
//   account (pode ser colado como texto puro ou em base64).
// Opcional:
//   BQ_PROJECT_ID = projeto onde os jobs de consulta rodam (padrão: o
//   project_id da própria chave).
// Papéis necessários para a service account no projeto dw-eolen-413717:
//   BigQuery Data Viewer + BigQuery Job User.

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

let cachedSa: ServiceAccount | null = null;
let cachedToken: { token: string; exp: number } | null = null;

function serviceAccount(): ServiceAccount {
  if (cachedSa) return cachedSa;
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GCP_SERVICE_ACCOUNT_JSON não configurada no servidor.");
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const sa = JSON.parse(text) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) throw new Error("GCP_SERVICE_ACCOUNT_JSON inválida.");
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  cachedSa = sa;
  return sa;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const sa = serviceAccount();
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/bigquery",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = b64url(signer.sign(sa.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error("Falha ao autenticar no Google Cloud: " + (data.error_description || data.error || res.status));
  }
  cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return cachedToken.token;
}

type BqField = { name: string; type: string; mode?: string; fields?: BqField[] };
type BqParam = { name: string; type: "STRING" | "INT64"; value: string | number };

function convert(value: unknown, field: BqField): unknown {
  if (value === null || value === undefined) return null;
  if (field.mode === "REPEATED") {
    return (value as { v: unknown }[]).map((x) => convert(x.v, { ...field, mode: "NULLABLE" }));
  }
  if (field.type === "RECORD" || field.type === "STRUCT") {
    const f = (value as { f: { v: unknown }[] }).f;
    const out: Record<string, unknown> = {};
    (field.fields || []).forEach((sub, i) => (out[sub.name] = convert(f[i].v, sub)));
    return out;
  }
  if (field.type === "INTEGER" || field.type === "INT64") {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : String(value);
  }
  if (field.type === "FLOAT" || field.type === "FLOAT64" || field.type === "NUMERIC") return Number(value);
  if (field.type === "BOOLEAN" || field.type === "BOOL") return value === "true";
  return value;
}

function toRows(schema: { fields: BqField[] } | undefined, rows: { f: { v: unknown }[] }[] | undefined) {
  if (!schema || !rows) return [];
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    schema.fields.forEach((field, i) => (o[field.name] = convert(r.f[i].v, field)));
    return o;
  });
}

/** Roda uma consulta SELECT (Standard SQL) e devolve as linhas como objetos. */
export async function bqQuery<T = Record<string, unknown>>(sql: string, params: BqParam[] = []): Promise<T[]> {
  const sa = serviceAccount();
  const project = process.env.BQ_PROJECT_ID || sa.project_id;
  if (!project) throw new Error("Defina BQ_PROJECT_ID no servidor.");
  const token = await accessToken();
  const auth = { Authorization: `Bearer ${token}` };

  const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${project}/queries`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: sql,
      useLegacySql: false,
      timeoutMs: 30000,
      maxResults: 10000,
      parameterMode: params.length ? "NAMED" : undefined,
      queryParameters: params.map((p) => ({
        name: p.name,
        parameterType: { type: p.type },
        parameterValue: { value: String(p.value) },
      })),
    }),
  });
  let data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Erro no BigQuery: " + (data?.error?.message || res.status));

  const jobId: string = data.jobReference?.jobId;
  const location: string | undefined = data.jobReference?.location;
  const all: T[] = [];
  // A primeira resposta pode chegar antes do fim do job (jobComplete=false)
  // ou trazer só a primeira página — segue buscando até acabar.
  for (let guard = 0; guard < 200; guard++) {
    if (data.jobComplete) all.push(...(toRows(data.schema, data.rows) as T[]));
    if (data.jobComplete && !data.pageToken) break;
    const qs = new URLSearchParams({ maxResults: "10000", timeoutMs: "30000" });
    if (location) qs.set("location", location);
    if (data.jobComplete && data.pageToken) qs.set("pageToken", data.pageToken);
    const next = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${project}/queries/${jobId}?${qs}`, { headers: auth });
    data = await next.json().catch(() => ({}));
    if (!next.ok) throw new Error("Erro no BigQuery: " + (data?.error?.message || next.status));
  }
  return all;
}
