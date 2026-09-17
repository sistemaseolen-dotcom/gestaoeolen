import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { extrairItensFichaEpi } from "@/lib/fichaEpiOcr";

const BUCKET = "treinamentos-anexos";

// Refaz a leitura por OCR do PDF que JÁ está anexado neste registro de
// "FICHA DE EPI" — sem precisar reenviar o arquivo.
//
// Por quê: a leitura automática (POST /api/treinamentos/[id]/arquivo) só
// roda no momento do upload. Uma ficha que deu erro de leitura antes de
// alguma correção no OCR (ex.: o bug do mupdf/tesseract.js quebrando no
// empacotamento do Next em produção) ficava com esse erro antigo gravado
// pra sempre, mesmo depois do bug corrigido — só uma releitura manual (ou
// reenviar o mesmo arquivo, o que é confuso e fácil de fazer errado, já que
// "Ver anexo" não reenvia nada) resolvia. Esta rota resolve isso direto:
// pega o arquivo que já está no Storage e lê de novo, agora.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("documentos", "editar");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: treino, error: fetchError } = await admin
    .from("treinamentos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!treino) {
    return NextResponse.json({ error: "Treinamento/documento não encontrado." }, { status: 404 });
  }
  if (treino.tipo !== "FICHA DE EPI") {
    return NextResponse.json({ error: "Este registro não é uma Ficha de EPI." }, { status: 400 });
  }
  if (!treino.arquivo_path) {
    return NextResponse.json({ error: "Nenhum arquivo anexado a este registro." }, { status: 400 });
  }

  let resultado: { ok: true; itens: unknown } | { ok: false; motivo: string };
  try {
    const { data: fileBlob, error: downloadError } = await admin.storage.from(BUCKET).download(treino.arquivo_path);
    if (downloadError || !fileBlob) {
      return NextResponse.json(
        { error: downloadError?.message || "Falha ao baixar o arquivo anexado do Storage." },
        { status: 500 }
      );
    }
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    resultado = await extrairItensFichaEpi(buffer);
  } catch (err: any) {
    console.error(`Falha ao reprocessar OCR da Ficha de EPI (treinamento ${id}):`, err?.stack || err);
    resultado = { ok: false, motivo: `Falha inesperada: ${err?.message || err}` };
  }

  const { data: after, error: updateError } = await admin
    .from("treinamentos")
    .update({
      epi_itens: resultado.ok ? resultado.itens : null,
      epi_ocr_erro: resultado.ok ? null : resultado.motivo,
      epi_ocr_atualizado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ...after,
    epiOcr: resultado.ok ? { itens: resultado.itens } : { erro: resultado.motivo },
  });
}
