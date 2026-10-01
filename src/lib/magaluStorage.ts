// Cliente para o Object Storage da Magalu Cloud (compatível com S3) — usado
// hoje só pelos anexos de "treinamentos" (treinamentos/documentos por
// pessoa: certificados, exames, Ficha de EPI etc.), no lugar do Supabase
// Storage que era usado antes.
//
// Pedido do Diego (30/09/2026): trocar o storage dos anexos de Treinamentos
// pro bucket que ele já criou na Magalu Cloud, mantendo o mesmo
// comportamento de hoje (bucket privado, front-end nunca acessa direto —
// só via URL assinada de curta duração gerada por estas rotas).
//
// Variáveis de ambiente necessárias (ver .env.example):
//   MAGALU_S3_ENDPOINT     — endpoint S3 da região da Magalu Cloud
//                            (ex.: https://br-se1.magaluobjects.com)
//   MAGALU_S3_REGION       — região (ex.: br-se1)
//   MAGALU_S3_BUCKET       — nome do bucket já criado por você na Magalu
//   MAGALU_S3_ACCESS_KEY   — Access Key ID
//   MAGALU_S3_SECRET_KEY   — Secret Access Key
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presignGetObject } from "@aws-sdk/s3-request-presigner";

let cachedClient: S3Client | null = null;

function client(): S3Client {
  if (cachedClient) return cachedClient;

  const endpoint = process.env.MAGALU_S3_ENDPOINT;
  const region = process.env.MAGALU_S3_REGION;
  const accessKeyId = process.env.MAGALU_S3_ACCESS_KEY;
  const secretAccessKey = process.env.MAGALU_S3_SECRET_KEY;

  if (!endpoint || !region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Magalu Object Storage não configurado: defina MAGALU_S3_ENDPOINT, MAGALU_S3_REGION, MAGALU_S3_ACCESS_KEY e MAGALU_S3_SECRET_KEY nas variáveis de ambiente."
    );
  }

  cachedClient = new S3Client({
    region,
    endpoint,
    // A maioria dos provedores S3-compatible (Magalu inclusive) espera
    // path-style (https://endpoint/bucket/key) em vez do virtual-hosted-style
    // padrão da AWS (https://bucket.endpoint/key).
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

// Organização de pastas dentro do bucket (pedido do Diego, 30/09/2026):
//   seguranca/<pessoaId>-<nome-sanitizado>/...   — documentos/treinamentos de
//     cada pessoa (inclusive Ficha de EPI), uma pasta por pessoa.
//   auditorias/<auditoriaId>-<site-sanitizado>/... — fotos (e outros anexos)
//     de cada auditoria (pedido do Diego, 01/10/2026: incluir o nome do
//     site na pasta, não só o número da auditoria).
function sanitizaNome(nome: string): string {
  return (nome || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function pessoaFolder(pessoaId: number | string, pessoaNome: string): string {
  const nomeSanitizado = sanitizaNome(pessoaNome);
  return `seguranca/${pessoaId}${nomeSanitizado ? "-" + nomeSanitizado : ""}`;
}

export function auditoriaFolder(auditoriaId: number | string, siteId?: string | null): string {
  const siteSanitizado = sanitizaNome(siteId || "");
  return `auditorias/${auditoriaId}${siteSanitizado ? "-" + siteSanitizado : ""}`;
}

// calibracao/<equipeId>-<nome-sanitizado>/... — anexos de calibração de
// equipamentos (pedido do Diego, 01/10/2026), uma pasta por EQUIPE (não por
// equipamento) — mesmo padrão das duas pastas acima.
export function calibracaoFolder(equipeId: number | string, equipeNome: string): string {
  const nomeSanitizado = sanitizaNome(equipeNome);
  return `calibracao/${equipeId}${nomeSanitizado ? "-" + nomeSanitizado : ""}`;
}

function bucketName(): string {
  const bucket = process.env.MAGALU_S3_BUCKET;
  if (!bucket) {
    throw new Error("Magalu Object Storage não configurado: defina MAGALU_S3_BUCKET nas variáveis de ambiente.");
  }
  return bucket;
}

export async function uploadFile(
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<{ error: string | null }> {
  try {
    await client().send(
      new PutObjectCommand({ Bucket: bucketName(), Key: path, Body: buffer, ContentType: contentType })
    );
    return { error: null };
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
}

// Remove um ou mais arquivos. Best-effort pelos chamadores (mesmo padrão de
// antes com o Supabase Storage) — se um path não existir mais, a API de
// delete em lote do S3 não retorna erro por isso.
export async function removeFiles(paths: string[]): Promise<{ error: string | null }> {
  const validPaths = paths.filter(Boolean);
  if (!validPaths.length) return { error: null };
  try {
    await client().send(
      new DeleteObjectsCommand({
        Bucket: bucketName(),
        Delete: { Objects: validPaths.map((Key) => ({ Key })) },
      })
    );
    return { error: null };
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }
}

// Confere só se o arquivo existe no Magalu, sem baixar o conteúdo (HEAD, não
// GET) — bem mais rápido/leve que downloadFile quando só precisamos saber se
// já está lá (ex.: na migração do storage antigo, pra decidir se pula ou
// copia cada item).
export async function fileExists(path: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucketName(), Key: path }));
    return true;
  } catch {
    return false;
  }
}

export async function downloadFile(path: string): Promise<{ data: Buffer | null; error: string | null }> {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: bucketName(), Key: path }));
    const body = res.Body;
    if (!body) return { data: null, error: "Arquivo vazio ou não encontrado." };
    const chunks: Buffer[] = [];
    // O runtime Node do Next entrega o Body como stream Node (AsyncIterable),
    // não como ReadableStream web.
    for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return { data: Buffer.concat(chunks), error: null };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

// Gera uma URL assinada e temporária pro objeto — equivalente ao
// createSignedUrl do Supabase Storage. `downloadFilename`: string usa esse
// nome no header de download; `true` usa o nome do próprio path; omitido não
// força download (abre inline, se o navegador suportar o content-type).
export async function createSignedUrl(
  path: string,
  expiresInSeconds: number,
  downloadFilename?: string | true
): Promise<{ url: string | null; error: string | null }> {
  try {
    const filename =
      downloadFilename === true ? path.split("/").pop() || "arquivo" : downloadFilename;
    const command = new GetObjectCommand({
      Bucket: bucketName(),
      Key: path,
      ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, "")}"` } : {}),
    });
    const url = await presignGetObject(client(), command, { expiresIn: expiresInSeconds });
    return { url, error: null };
  } catch (err: any) {
    return { url: null, error: err?.message || String(err) };
  }
}
