import { createSign } from "crypto";

// Leitura do BigQuery (dw-eolen) direto pela API REST, sem dependência nova
// no package.json. Usado pelo módulo Controle de VO (pedido do Diego,
// 14/10/2026) para ler as views esupplier.vw_vo_change e
// log.vw_log_esuplier_vochange. Somente SELECT.
//
// Variável de ambiente (SECRETA, só no servidor — nunca NEXT_PUBLIC_):
//   GCP_CREDENTIALS_JSON — aceita dois formatos (texto puro ou base64):
//   1) Autorização do próprio usuário (o que está em uso hoje): JSON
//      {"type":"authorized_user","client_id","client_secret","refresh_token"}
//      gerado quando o Diego autorizou o acesso ao BigQuery com a conta dele
//      (14/10/2026). Usa as permissões que ELE tem no BigQuery. Se ele trocar
//      a senha, revogar o acesso em myaccount.google.com/permissions ou a
//      conta for desativada, a aba para de atualizar e é preciso autorizar
//      de novo (gerar um novo refresh_token).
//   2) Chave de service account (quando houver permissão pra criar uma):
//      o .json da chave, {"type":"service_account","client_email",
//      "private_key",...}, com os papéis BigQuery Data Viewer + BigQuery Job
//      User no projeto dw-eolen-413717. Basta trocar o valor da variável.
//   (GCP_SERVICE_ACCOUNT_JSON também é aceita, pelo mesmo formato.)
// Opcional:
//   BQ_PROJECT_ID = projeto onde os jobs de consulta rodam (padrão:
//   dw-eolen-413717, ou o project_id da chave de service account).

interface Credenciais {
  type?: string;
  client_email?: string;
  private_key?: string;
  project_id?: string;
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
}

let cachedCred: Credenciais | null = null;
let cachedToken: { token: string; exp: number } | null = null;

function credenciais(): Credenciais {
  if (cachedCred) return cachedCred;
  const raw = process.env.GCP_CREDENTIALS_JSON || process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GCP_CREDENTIALS_JSON não configurada no servidor.");
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const c = JSON.parse(text) as Credenciais;
  if (c.type === "authorized_user") {
    if (!c.client_id || !c.client_secret || !c.refresh_token) throw new Error("GCP_CREDENTIALS_JSON (authorized_user) incompleta.");
  } else {
    if (!c.client_email || !c.private_key) throw new Error("GCP_CREDENTIALS_JSON inválida.");
    c.private_key = c.private_key.replace(/\\n/g, "\n");
  }
  cachedCred = c;
  return c;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function trocarToken(params: Record<string, string>): Promise<{ access_token: string; expires_in?: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const motivo = data.error_description || data.error || res.status;
    if (data.error === "invalid_grant") {
      throw new Error("A autorização de acesso ao BigQuery expirou ou foi revogada — é preciso autorizar de novo (" + motivo + ").");
    }
    throw new Error("Falha ao autenticar no Google Cloud: " + motivo);
  }
  return data;
}

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const c = credenciais();
  let data: { access_token: string; expires_in?: number };
  if (c.type === "authorized_user") {
    data = await trocarToken({
      grant_type: "refresh_token",
      client_id: c.client_id!,
      client_secret: c.client_secret!,
      refresh_token: c.refresh_token!,
    });
  } else {
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(
      JSON.stringify({
        iss: c.client_email,
        scope: "https://www.googleapis.com/auth/bigquery",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      })
    );
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    const signature = b64url(signer.sign(c.private_key!));
    data = await trocarToken({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    });
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
  const c = credenciais();
  const project = process.env.BQ_PROJECT_ID || c.project_id || "dw-eolen-413717";
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
