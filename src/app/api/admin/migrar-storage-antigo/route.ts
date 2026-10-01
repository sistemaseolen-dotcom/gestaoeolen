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
// Correção do Diego (01/10/2026): o `arquivo_path` ANTIGO das fotos de
// auditoria é só "<auditoriaId>/<slotKey><ext>" (sem pasta "auditorias/" —
// era o nome do bucket antigo que fazia esse papel). Copiar pro Magalu nesse
// MESMO path (como a primeira versão desta rota fazia) jogava cada auditoria
// como uma pasta solta na raiz do bucket. O certo — pedido do Diego — é cada
// foto ficar em "auditorias/<auditoriaId>-<site>/<slotKey><ext>" (mesmo
// padrão de "seguranca/<pessoaId>-<nome>" já usado pros documentos de
// pessoa), valendo tanto pras fotos antigas quanto pras novas a partir de
// agora (isso já foi ajustado em src/lib/magaluStorage.ts e
// src/app/api/auditorias/[id]/fotos/route.ts). Por isso, pra fotos de
// auditoria, esta rota agora:
//   1. calcula o path CORRETO (com a pasta "auditorias/" e o nome do site);
//   2. se o arquivo já está no path correto, não faz nada (ok);
//   3. se não, busca o conteúdo onde quer que ele esteja hoje — no path
//      correto não, mas talvez já tenha sido jogado (por engano, por uma
//      versão anterior desta rota) no path antigo dentro do Magalu, ou então
//      ainda só exista no bucket antigo do Supabase — sobe no path correto,
//      atualiza o `arquivo_path` no banco pra apontar pro lugar novo, e
//      remove (best-effort) o arquivo solto que tinha ficado no lugar
//      errado.
//
// Anexos de treinamentos/documentos (pasta "seguranca/<pessoaId>-<nome>")
// não tiveam esse problema — o path salvo no banco já inclui a pasta certa
// desde a migração original — então continuam só copiados pro mesmo path.
//
// Chamar várias vezes é seguro (idempotente): tudo que já foi corrigido ou
// copiado é detectado e pulado na próxima chamada. Processa em lote com
// orçamento de tempo pra não estourar o limite da função serverless — se não
// terminar tudo numa chamada, retorna concluido:false e é só chamar de novo
// (recarregar a página) que continua de onde parou.
export const maxDuration = 60;

const OLD_BUCKET_FOTOS = "auditorias-anexos";
const OLD_BUCKET_DOCS = "treinamentos-anexos";
const TIME_BUDGET_MS = 40_000;

function contentTypeFromPath(path: string): string {
  const ext = (path.split(".").pop() || "").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "pdf") return "application/pdf";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

type Item = {
  kind: "foto" | "documento";
  id: number;
  path: string; // path salvo hoje no banco (pode estar errado, no caso de foto)
  targetPath: string; // path onde o arquivo DEVERIA estar (igual a `path` quando não há correção a fazer)
  oldBucket: string;
  contexto: string;
};

type Resultado =
  | "ok"
  | "migrado"
  | "corrigido"
  | { faltando: { kind: string; id: number; path: string; contexto: string } };

export async function GET() {
  const gate = await requireAuth();
  if (gate.response) return gate.response;
  if (!isAdmin(gate.user)) return forbidden("Só um administrador pode rodar essa migração.");

  const admin = supabaseAdmin();
  const startedAt = Date.now();

  const [{ data: fotos, error: fotosError }, { data: treinos, error: treinosError }, { data: auditorias, error: auditoriasError }] =
    await Promise.all([
      admin.from("auditoria_fotos").select("id, auditoria_id, arquivo_path").not("arquivo_path", "is", null),
      admin.from("treinamentos").select("id, pessoa_nome, tipo, arquivo_path").not("arquivo_path", "is", null),
      admin.from("auditorias").select("id, site_id"),
    ]);
  if (fotosError) return NextResponse.json({ error: fotosError.message }, { status: 500 });
  if (treinosError) return NextResponse.json({ error: treinosError.message }, { status: 500 });
  if (auditoriasError) return NextResponse.json({ error: auditoriasError.message }, { status: 500 });

  const siteIdPorAuditoria = new Map<number, string | null>((auditorias || []).map((a) => [a.id, a.site_id]));

  const itens: Item[] = [
    ...(fotos || []).map((f) => {
      const path = f.arquivo_path as string;
      const nomeArquivo = path.split("/").pop() || path;
      const siteId = siteIdPorAuditoria.get(f.auditoria_id) ?? null;
      const targetPath = `${storage.auditoriaFolder(f.auditoria_id, siteId)}/${nomeArquivo}`;
      return {
        kind: "foto" as const,
        id: f.id,
        path,
        targetPath,
        oldBucket: OLD_BUCKET_FOTOS,
        contexto: "Auditoria #" + f.auditoria_id,
      };
    }),
    ...(treinos || []).map((t) => ({
      kind: "documento" as const,
      id: t.id,
      path: t.arquivo_path as string,
      targetPath: t.arquivo_path as string, // documentos não têm esse problema — path de hoje já é o correto
      oldBucket: OLD_BUCKET_DOCS,
      contexto: (t.tipo || "Documento") + " — " + (t.pessoa_nome || "?"),
    })),
  ];

  let verificados = 0;
  let jaOk = 0;
  let migrados = 0;
  let corrigidos = 0;
  const faltando: { kind: string; id: number; path: string; contexto: string }[] = [];
  let concluido = true;

  // Processa um item. Isolado numa função pra poder rodar várias chamadas em
  // paralelo (ver CONCURRENCY abaixo) — o gargalo aqui é ida-e-volta de rede
  // (download/upload), não CPU, então paralelizar ajuda bastante a processar
  // mais dentro do orçamento de tempo da função.
  async function processa(item: Item): Promise<Resultado> {
    // Caso simples (documentos, e fotos cujo path já está correto): só
    // confere se já está no Magalu nesse mesmo path e, se não, copia do
    // bucket antigo do Supabase pra esse path.
    if (item.targetPath === item.path) {
      const jaNoMagalu = await storage.fileExists(item.path);
      if (jaNoMagalu) return "ok";
      const { data: oldData, error: oldError } = await admin.storage.from(item.oldBucket).download(item.path);
      if (oldError || !oldData) {
        return { faltando: { kind: item.kind, id: item.id, path: item.path, contexto: item.contexto } };
      }
      const buffer = Buffer.from(await oldData.arrayBuffer());
      const contentType = oldData.type && oldData.type !== "application/octet-stream" ? oldData.type : contentTypeFromPath(item.path);
      const { error: uploadError } = await storage.uploadFile(item.path, buffer, contentType);
      if (uploadError) {
        return { faltando: { kind: item.kind, id: item.id, path: item.path, contexto: item.contexto + " (erro ao subir: " + uploadError + ")" } };
      }
      return "migrado";
    }

    // Caso foto de auditoria com path errado (sem a pasta "auditorias/"
    // correta): o arquivo já está no lugar certo?
    const jaNoLugarCerto = await storage.fileExists(item.targetPath);
    if (!jaNoLugarCerto) {
      // Ainda não — busca o conteúdo: primeiro no path antigo DENTRO do
      // Magalu (pode já ter sido jogado lá por engano por uma versão
      // anterior desta rota); se não achar, no bucket antigo do Supabase.
      let buffer: Buffer | null = null;
      let contentType = contentTypeFromPath(item.path);
      const noMagaluErrado = await storage.downloadFile(item.path);
      if (noMagaluErrado.data) {
        buffer = noMagaluErrado.data;
      } else {
        const { data: oldData, error: oldError } = await admin.storage.from(item.oldBucket).download(item.path);
        if (oldError || !oldData) {
          return { faltando: { kind: item.kind, id: item.id, path: item.path, contexto: item.contexto } };
        }
        buffer = Buffer.from(await oldData.arrayBuffer());
        contentType = oldData.type && oldData.type !== "application/octet-stream" ? oldData.type : contentType;
      }
      const { error: uploadError } = await storage.uploadFile(item.targetPath, buffer, contentType);
      if (uploadError) {
        return { faltando: { kind: item.kind, id: item.id, path: item.path, contexto: item.contexto + " (erro ao subir: " + uploadError + ")" } };
      }
    }

    // Path certo garantido — atualiza o banco pra apontar pra lá e limpa o
    // arquivo solto que tinha ficado no lugar errado (best-effort, não
    // bloqueia o resultado).
    const { error: updateError } = await admin.from("auditoria_fotos").update({ arquivo_path: item.targetPath }).eq("id", item.id);
    if (updateError) {
      return { faltando: { kind: item.kind, id: item.id, path: item.path, contexto: item.contexto + " (erro ao atualizar banco: " + updateError.message + ")" } };
    }
    await storage.removeFiles([item.path]);
    return "corrigido";
  }

  const CONCURRENCY = 8;
  for (let i = 0; i < itens.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      concluido = false;
      break;
    }
    const lote = itens.slice(i, i + CONCURRENCY);
    const resultados = await Promise.all(lote.map(processa));
    for (const r of resultados) {
      verificados++;
      if (r === "ok") jaOk++;
      else if (r === "migrado") migrados++;
      else if (r === "corrigido") corrigidos++;
      else faltando.push(r.faltando);
    }
  }

  return NextResponse.json({
    concluido,
    totalRegistros: itens.length,
    verificados,
    jaOk,
    migrados,
    corrigidos,
    faltando,
  });
}
