import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import * as storage from "@/lib/magaluStorage";
import { auditDiffFields } from "@/lib/audit";

// Não pode ser exportada — um route.ts do App Router só pode exportar
// handlers HTTP (GET/POST/...) e algumas poucas configs (ver o mesmo erro já
// corrigido em CAMPOS_VEICULO, src/app/api/veiculos/route.ts).
const MAX_BYTES = 40 * 1024 * 1024; // 40MB — pedido do Diego (05/10/2026).

// Upload de Documentos/Treinamentos em DUAS etapas, pra contornar o limite
// de 4,5MB por requisição que a Vercel impõe nas funções de servidor (não é
// configurável — é do próprio provedor, não tem como aumentar daqui). Até
// 05/10/2026 o arquivo subia inteiro pro nosso servidor (função serverless),
// que então repassava pro Magalu — por isso o limite prático de verdade já
// era bem menor que os "5MB" validados no código (qualquer coisa perto
// disso já estourava o limite da Vercel antes de chegar na nossa validação).
//
// Agora:
//   1. POST aqui (esta rota) — corpo pequeno (nome/tipo/tamanho do arquivo,
//      nunca o arquivo em si) — calcula o path, gera uma URL assinada de
//      upload direto pro Magalu (createSignedUploadUrl) e devolve pro
//      navegador. Não toca no banco nem remove o anexo antigo ainda.
//   2. O NAVEGADOR manda o arquivo direto pro Magalu com essa URL (PUT),
//      sem passar pela Vercel — é isso que permite ir até 40MB.
//   3. POST /api/treinamentos/[id]/arquivo/concluir — corpo pequeno de novo
//      (só o path) — confere que o arquivo realmente chegou no Magalu, só
//      ENTÃO remove o anexo antigo, atualiza o banco e roda o OCR da Ficha
//      de EPI se for o caso.
//
// Exige CORS configurado no bucket do Magalu (rodar uma vez
// /api/admin/configurar-cors-storage, logado como admin) — sem isso o PUT do
// passo 2 falha no navegador com erro de CORS.

// Mantém só caracteres seguros no nome do arquivo dentro do path do bucket
// (o nome original, sem sanitizar, continua guardado em arquivo_nome para
// exibição — só o path físico no storage precisa ser "limpo").
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

// Devolve uma URL assinada e temporária pro anexo — o bucket é privado
// (sem policy pública), então o front-end nunca lê o Storage direto, sempre
// passa por aqui pra pegar um link de curta duração (60s, só o necessário
// pra abrir/baixar).
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("documentos", "ver");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: treino, error: fetchError } = await admin
    .from("treinamentos")
    .select("arquivo_path, arquivo_nome")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!treino || !treino.arquivo_path) {
    return NextResponse.json({ error: "Nenhum arquivo anexado." }, { status: 404 });
  }

  const { url, error: signError } = await storage.createSignedUrl(
    treino.arquivo_path,
    60,
    treino.arquivo_nome || true
  );
  if (signError || !url) {
    return NextResponse.json({ error: signError || "Falha ao gerar link do anexo." }, { status: 500 });
  }

  return NextResponse.json({ url, nome: treino.arquivo_nome });
}

// Passo 1/2: devolve uma URL assinada de upload (PUT) direto pro Magalu —
// ver o comentário grande no topo do arquivo. Não toca no banco nem remove
// o anexo antigo ainda (só o passo 2, /concluir, faz isso — depois de
// confirmar que o arquivo novo realmente chegou no storage).
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("documentos", "editar");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const nomeArquivo = typeof body?.nomeArquivo === "string" && body.nomeArquivo.trim() ? body.nomeArquivo : "arquivo";
  const contentType = typeof body?.contentType === "string" && body.contentType ? body.contentType : "application/octet-stream";
  const tamanho = Number(body?.tamanho);
  if (!Number.isFinite(tamanho) || tamanho <= 0) {
    return NextResponse.json({ error: "Tamanho do arquivo inválido." }, { status: 400 });
  }
  if (tamanho > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo muito grande (máx. 40MB)." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: treino, error: fetchError } = await admin
    .from("treinamentos")
    .select("id, pessoa_id, pessoa_nome")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!treino) {
    return NextResponse.json({ error: "Treinamento/documento não encontrado." }, { status: 404 });
  }

  // Busca o CPF pra montar a pasta no padrão Nome+CPF (pedido do Diego) —
  // `treinamentos` só guarda pessoa_id/pessoa_nome (denormalizado), não cpf.
  const { data: pessoaCpfRow } = await admin.from("pessoas").select("cpf").eq("id", treino.pessoa_id).maybeSingle();

  const path = `${storage.pessoaFolder(treino.pessoa_id, treino.pessoa_nome, pessoaCpfRow?.cpf)}/${id}-${Date.now()}-${sanitizeFilename(nomeArquivo)}`;

  const { url, error: signError } = await storage.createSignedUploadUrl(path, contentType, 600);
  if (signError || !url) {
    return NextResponse.json({ error: signError || "Falha ao gerar link de upload." }, { status: 500 });
  }

  return NextResponse.json({ uploadUrl: url, path });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("documentos", "editar");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: before, error: fetchError } = await admin
    .from("treinamentos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!before || !before.arquivo_path) {
    return NextResponse.json({ error: "Nenhum arquivo para remover." }, { status: 404 });
  }

  const { error: removeError } = await storage.removeFiles([before.arquivo_path]);
  if (removeError) {
    console.error(`Falha ao remover anexo ${before.arquivo_path}:`, removeError);
  }

  const { data: after, error: updateError } = await admin
    .from("treinamentos")
    .update({ arquivo_path: null, arquivo_nome: null })
    .eq("id", id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Sem anexo, a leitura de CA/equipamento anterior (se houver) não vale
  // mais — limpa junto, mas como um passo separado e best-effort: se a
  // coluna ainda não existir no banco (migração da leitura de Ficha de EPI
  // ainda não aplicada), isso não pode derrubar a exclusão do anexo, que já
  // foi concluída com sucesso acima.
  if (after.tipo === "FICHA DE EPI") {
    const { error: epiClearError } = await admin
      .from("treinamentos")
      .update({ epi_itens: null, epi_ocr_erro: null, epi_ocr_atualizado_em: null })
      .eq("id", id);
    if (epiClearError) {
      console.error(`Falha ao limpar leitura da Ficha de EPI (treinamento ${id}):`, epiClearError.message);
    }
  }

  await auditDiffFields({
    entidade: "treinamento",
    entidadeId: id,
    entidadeLabel: `${after.tipo} — ${after.pessoa_nome}`,
    before,
    after,
    campos: ["arquivo_nome"],
    usuario: gate.user,
  });

  return NextResponse.json(after);
}
