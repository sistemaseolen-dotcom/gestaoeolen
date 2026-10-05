import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import * as storage from "@/lib/magaluStorage";
import { auditDiffFields } from "@/lib/audit";
import { extrairItensFichaEpi } from "@/lib/fichaEpiOcr";

// Passo 2/2 do upload de Documentos/Treinamentos — ver o comentário grande
// em ../route.ts. Chamado pelo navegador DEPOIS de já ter mandado o arquivo
// direto pro Magalu (PUT na URL assinada que ../route.ts devolveu). Aqui:
// confere que o arquivo realmente chegou (HEAD no storage — nunca confia só
// na palavra do navegador), só ENTÃO remove o anexo antigo, atualiza o banco
// e roda o OCR da Ficha de EPI se for o caso (igual o POST fazia antes desta
// rota existir).
export async function POST(req: Request, { params }: { params: { id: string } }) {
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

  const path = typeof body?.path === "string" ? body.path : "";
  const nomeArquivo = typeof body?.nomeArquivo === "string" && body.nomeArquivo.trim() ? body.nomeArquivo : "arquivo";
  if (!path) {
    return NextResponse.json({ error: "Path do arquivo não informado." }, { status: 400 });
  }

  const existe = await storage.fileExists(path);
  if (!existe) {
    return NextResponse.json({ error: "O upload não chegou no armazenamento — tente novamente." }, { status: 400 });
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
  if (!before) {
    return NextResponse.json({ error: "Treinamento/documento não encontrado." }, { status: 404 });
  }

  // Só agora, com o arquivo novo já confirmado no storage, removemos o
  // anexo antigo (best-effort — se a remoção falhar, seguimos mesmo assim).
  if (before.arquivo_path && before.arquivo_path !== path) {
    const { error: removeError } = await storage.removeFiles([before.arquivo_path]);
    if (removeError) {
      console.error(`Falha ao remover anexo anterior ${before.arquivo_path}:`, removeError);
    }
  }

  const { data: after, error: updateError } = await admin
    .from("treinamentos")
    .update({ arquivo_path: path, arquivo_nome: nomeArquivo })
    .eq("id", id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
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

  // Se este anexo é a "Ficha de EPI" (formulário de controle de EPI's) de
  // alguém em PDF, tenta ler automaticamente a tabela de CA/equipamento por
  // OCR — é o que alimenta a verificação de CA na auditoria (pedido do
  // Diego). Best-effort: qualquer falha aqui (OCR não reconheceu nada,
  // coluna nova ainda não existe no banco, etc.) não pode derrubar o
  // upload do anexo em si, que já foi concluído com sucesso acima. Baixa o
  // arquivo de volta do Magalu só pra isso — o conteúdo nunca passou pelo
  // nosso servidor no upload em si (ver ../route.ts).
  let epiOcr: { itens?: unknown; erro?: string } | null = null;
  if (after.tipo === "FICHA DE EPI" && path.toLowerCase().endsWith(".pdf")) {
    try {
      const { data: buffer, error: downloadError } = await storage.downloadFile(path);
      if (downloadError || !buffer) {
        console.error(`Falha ao baixar anexo pra OCR (treinamento ${id}):`, downloadError);
      } else {
        const resultado = await extrairItensFichaEpi(buffer);
        epiOcr = resultado.ok ? { itens: resultado.itens } : { erro: resultado.motivo };
        const { error: epiUpdateError } = await admin
          .from("treinamentos")
          .update({
            epi_itens: resultado.ok ? resultado.itens : null,
            epi_ocr_erro: resultado.ok ? null : resultado.motivo,
            epi_ocr_atualizado_em: new Date().toISOString(),
          })
          .eq("id", id);
        if (epiUpdateError) {
          console.error(`Falha ao gravar leitura da Ficha de EPI (treinamento ${id}):`, epiUpdateError.message);
        }
      }
    } catch (err: any) {
      console.error(`Falha ao processar OCR da Ficha de EPI (treinamento ${id}):`, err?.message || err);
    }
  }

  return NextResponse.json({ ...after, ...(epiOcr ? { epiOcr } : {}) });
}
