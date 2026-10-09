import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import * as storage from "@/lib/magaluStorage";
import { extrairItensFichaEpi } from "@/lib/fichaEpiOcr";

// Pedido do Diego (10/2026): reler TODAS as Fichas de EPI já cadastradas no
// sistema, sem precisar clicar "Reler ficha" uma por uma (existem ~630
// fichas pendentes hoje — nunca lidas, ou lidas sem sucesso por causa do bug
// do bmp-js/tesseract.js corrigido em next.config.js). A leitura automática
// no upload (POST /api/treinamentos/[id]/arquivo) já cobre fichas novas daqui
// pra frente -- esta rota é só o backlog das que já existiam antes.
//
// Cada OCR (baixa o PDF, renderiza em PNG, recorta 3 colunas, reconhece
// texto) leva alguns segundos. Processar as ~630 de uma vez numa chamada só
// estouraria o limite de 300s da Vercel (plano Hobby) bem antes de terminar
// -- por isso esta rota processa um LOTE pequeno por chamada e devolve
// quantas ainda faltam. O botão em Admin > Configurações chama ela em loop,
// sozinho, até `restantes` chegar a 0 -- nenhum clique extra precisa
// acontecer depois do primeiro.
//
// Cada ficha processada já grava o resultado no banco antes de passar pra
// próxima (não só no fim do lote) -- se uma chamada cair no meio por
// qualquer motivo, o progresso já feito não se perde; a próxima chamada
// simplesmente continua de onde parou (a lista de pendentes é recalculada
// do banco a cada chamada, não por um cursor/offset que poderia pular ou
// repetir registros).
const LOTE = 5;

export async function POST() {
  const gate = await requirePermission("documentos", "editar");
  if (gate.response) return gate.response;

  const admin = supabaseAdmin();

  const { data: candidatos, error: fetchError } = await admin
    .from("treinamentos")
    .select("id, arquivo_path, epi_itens, epi_ocr_erro")
    .eq("tipo", "FICHA DE EPI")
    .not("arquivo_path", "is", null)
    .order("id", { ascending: true });
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const pendentes = (candidatos || []).filter((t) => {
    const semItens = !Array.isArray(t.epi_itens) || t.epi_itens.length === 0;
    return semItens || !!t.epi_ocr_erro;
  });

  const lote = pendentes.slice(0, LOTE);
  let lidas = 0;
  let comErro = 0;
  const erros: { id: number; motivo: string }[] = [];

  for (const t of lote) {
    let resultado: { ok: true; itens: unknown } | { ok: false; motivo: string };
    try {
      const { data: buffer, error: downloadError } = await storage.downloadFile(t.arquivo_path as string);
      if (downloadError || !buffer) {
        resultado = { ok: false, motivo: downloadError || "Falha ao baixar o arquivo anexado do Storage." };
      } else {
        resultado = await extrairItensFichaEpi(buffer);
      }
    } catch (err: any) {
      console.error(`Falha ao reprocessar OCR da Ficha de EPI (treinamento ${t.id}):`, err?.stack || err);
      resultado = { ok: false, motivo: `Falha inesperada: ${err?.message || err}` };
    }

    await admin
      .from("treinamentos")
      .update({
        epi_itens: resultado.ok ? resultado.itens : null,
        epi_ocr_erro: resultado.ok ? null : resultado.motivo,
        epi_ocr_atualizado_em: new Date().toISOString(),
      })
      .eq("id", t.id);

    if (resultado.ok) lidas++;
    else {
      comErro++;
      erros.push({ id: t.id, motivo: resultado.motivo });
    }
  }

  return NextResponse.json({
    pendentesAntes: pendentes.length,
    processadas: lote.length,
    lidas,
    comErro,
    restantes: pendentes.length - lote.length,
    erros,
  });
}
