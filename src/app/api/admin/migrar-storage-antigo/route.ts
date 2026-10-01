import { NextResponse } from "next/server";
import { requireAuth, forbidden } from "@/lib/authGuard";
import { isAdmin } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import * as storage from "@/lib/magaluStorage";

// Ferramenta de uso único (admin): depois da migração de Storage (Supabase ->
// Magalu Cloud), os registros criados ANTES da migração continuam com o
// `arquivo_path` de sempre, mas o arquivo em si ainda está só no bucket
// antigo do Supabase — por isso fotos de auditoria e anexos de
// treinamentos/documentos antigos apareciam em branco.
//
// Esta rota copia, registro por registro, o que estiver faltando no Magalu:
// baixa do bucket antigo do Supabase (pelo mesmo `arquivo_path` já salvo) e
// sobe pro Magalu nesse mesmo caminho — sem precisar mudar nada no banco.
//
// Pedido do Diego (01/10/2026): "precisamos exportar as imagens que estava
// no storage antigo e migrar para o novo, para que todos os relatórios
// realizados fiquem com suas fotos".
//
// Chamar várias vezes é seguro (idempotente): tudo que já foi copiado é
// detectado e pulado na próxima chamada. Processa em lote com orçamento de
// tempo pra não estourar o limite da função serverless — se não terminar
// tudo numa chamada, retorna concluido:false e é só chamar de novo
// (recarregar a página) que continua de onde parou.
export const maxDuration = 60;

const OLD_BUCKET_FOTOS = "auditorias-anexos";
const OLD_BUCKET_DOCS = "treinamentos-anexos";
const TIME_BUDGET_MS = 50_000;

function contentTypeFromPath(path: string): string {
  const ext = (path.split(".").pop() || "").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "pdf") return "application/pdf";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

type Item = { kind: "foto" | "documento"; id: number; path: string; oldBucket: string; contexto: string };

export async function GET() {
  const gate = await requireAuth();
  if (gate.response) return gate.response;
  if (!isAdmin(gate.user)) return forbidden("Só um administrador pode rodar essa migração.");

  const admin = supabaseAdmin();
  const startedAt = Date.now();

  const [{ data: fotos, error: fotosError }, { data: treinos, error: treinosError }] = await Promise.all([
    admin.from("auditoria_fotos").select("id, auditoria_id, arquivo_path").not("arquivo_path", "is", null),
    admin.from("treinamentos").select("id, pessoa_nome, tipo, arquivo_path").not("arquivo_path", "is", null),
  ]);
  if (fotosError) return NextResponse.json({ error: fotosError.message }, { status: 500 });
  if (treinosError) return NextResponse.json({ error: treinosError.message }, { status: 500 });

  const itens: Item[] = [
    ...(fotos || []).map((f) => ({
      kind: "foto" as const,
      id: f.id,
      path: f.arquivo_path as string,
      oldBucket: OLD_BUCKET_FOTOS,
      contexto: "Auditoria #" + f.auditoria_id,
    })),
    ...(treinos || []).map((t) => ({
      kind: "documento" as const,
      id: t.id,
      path: t.arquivo_path as string,
      oldBucket: OLD_BUCKET_DOCS,
      contexto: (t.tipo || "Documento") + " — " + (t.pessoa_nome || "?"),
    })),
  ];

  let verificados = 0;
  let jaOk = 0;
  let migrados = 0;
  const faltando: { kind: string; id: number; path: string; contexto: string }[] = [];
  let concluido = true;

  for (const item of itens) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      concluido = false;
      break;
    }
    verificados++;

    const jaNoMagalu = await storage.downloadFile(item.path);
    if (jaNoMagalu.data) {
      jaOk++;
      continue;
    }

    const { data: oldData, error: oldError } = await admin.storage.from(item.oldBucket).download(item.path);
    if (oldError || !oldData) {
      faltando.push({ kind: item.kind, id: item.id, path: item.path, contexto: item.contexto });
      continue;
    }

    const buffer = Buffer.from(await oldData.arrayBuffer());
    const contentType = oldData.type && oldData.type !== "application/octet-stream" ? oldData.type : contentTypeFromPath(item.path);
    const { error: uploadError } = await storage.uploadFile(item.path, buffer, contentType);
    if (uploadError) {
      faltando.push({ kind: item.kind, id: item.id, path: item.path, contexto: item.contexto + " (erro ao subir: " + uploadError + ")" });
      continue;
    }
    migrados++;
  }

  return NextResponse.json({
    concluido,
    totalRegistros: itens.length,
    verificados,
    jaOk,
    migrados,
    faltando,
  });
}
