import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buscarEsignDocumento } from "@/lib/docsales";
import { finalizarFichaEpiAssinada } from "@/lib/finalizarFichaEpiAssinada";

// Webhook do Docsales — chamado quando um documento de assinatura muda de
// estado (assinado, rejeitado, cancelado, lido). Configurado manualmente no
// painel Docsales (Configurações -> Webhook -> URL), apontando pra
// https://SEU-DOMINIO/api/webhooks/docsales/<DOCSALES_WEBHOOK_SECRET>.
//
// Autenticação: o Docsales não permite configurar um header customizado no
// webhook, então o segredo vai na própria URL (comparação constant-time
// mesmo assim, por hábito). MAS o ponto importante de segurança é outro:
// este handler NUNCA age direto sobre o que vem no corpo do webhook — o
// corpo só diz "algo mudou no documento X"; antes de fazer qualquer coisa
// (principalmente antes de substituir o anexo da Ficha de EPI), ele
// SEMPRE busca de volta o documento na própria API Docsales (com o nosso
// token) pra confirmar o status real. Isso fecha a porta pra alguém
// forjar um POST pra este endpoint fingindo que um documento foi assinado.
//
// Eventos (nome vem em `event`, com o prefixo "document_was_"):
//   document_was_signed             -> confirma via GET; se status=approved, finaliza.
//   document_was_partially_signed   -> só atualiza o status guardado (mais de 1 signatário — não é o nosso caso hoje, só o colaborador assina, mas trata por completude).
//   document_was_rejected           -> marca rejeitado.
//   document_was_canceled           -> marca cancelado.
//   document_was_read               -> só atualiza o status (informativo).
export const maxDuration = 30;

function segredoValido(recebido: string): boolean {
  const esperado = process.env.DOCSALES_WEBHOOK_SECRET;
  if (!esperado) return false;
  if (recebido.length !== esperado.length) return false;
  // Comparação simples (não é uma rota de altíssimo risco — a verificação
  // real de confiança é o re-fetch autenticado na API Docsales abaixo, não
  // este segredo por si só) — mas evita o caminho mais óbvio de
  // comparação com early-exit.
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) {
    if (recebido[i] !== esperado[i]) diff++;
  }
  return diff === 0;
}

async function baixarPdf(url: string): Promise<Buffer> {
  const absUrl = url.startsWith("//") ? `https:${url}` : url;
  const res = await fetch(absUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Falha ao baixar o PDF assinado (Docsales respondeu ${res.status}).`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function POST(req: Request, context: { params: Promise<{ secret: string }> }) {
  const params = await context.params;
  if (!segredoValido(params.secret || "")) {
    // 404 (não 401/403) — não confirma pra quem está tentando adivinhar
    // que esse caminho existe.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const evento: string = payload?.event || "";
  const documentoId: number | undefined = payload?.data?.document?.id;
  if (!documentoId) {
    return NextResponse.json({ error: "Payload sem data.document.id." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: registro, error: registroError } = await admin
    .from("docsales_esign_documentos")
    .select("*")
    .eq("docsales_document_id", documentoId)
    .maybeSingle();
  if (registroError) {
    console.error("Erro ao buscar registro docsales_esign_documentos:", registroError.message);
    return NextResponse.json({ error: registroError.message }, { status: 500 });
  }
  if (!registro) {
    // Documento não é nosso (ou já foi removido) — responde 200 mesmo
    // assim pra o Docsales não ficar tentando reenviar o webhook pra
    // sempre; só loga pra investigar se acontecer com frequência.
    console.warn(`Webhook Docsales: documento ${documentoId} não encontrado em docsales_esign_documentos (evento ${evento}).`);
    return NextResponse.json({ ok: true });
  }

  // Idempotência: se já processamos a finalização deste documento, não
  // repete (o Docsales pode reenviar o mesmo webhook mais de uma vez).
  if (registro.concluido_em) {
    return NextResponse.json({ ok: true, jaProcessado: true });
  }

  // NUNCA confia direto no payload pra decidir o que fazer — sempre
  // reconfirma buscando o documento de volta na API Docsales.
  let documento;
  try {
    documento = await buscarEsignDocumento(documentoId);
  } catch (err: any) {
    console.error(`Falha ao confirmar documento Docsales ${documentoId}:`, err?.message || err);
    return NextResponse.json({ error: "Falha ao confirmar documento." }, { status: 502 });
  }

  const statusReal = documento.status;

  if (statusReal === "approved") {
    const pdfUrl = documento.approval?.pdf_url || documento.pdf_url;
    if (!pdfUrl) {
      console.error(`Documento Docsales ${documentoId} aprovado mas sem pdf_url.`);
      return NextResponse.json({ error: "Documento aprovado sem PDF disponível." }, { status: 502 });
    }
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await baixarPdf(pdfUrl);
    } catch (err: any) {
      console.error(`Falha ao baixar PDF assinado (documento ${documentoId}):`, err?.message || err);
      return NextResponse.json({ error: "Falha ao baixar o PDF assinado." }, { status: 502 });
    }

    try {
      const { pendenciaId } = await finalizarFichaEpiAssinada(admin, {
        treinamentoId: registro.treinamento_id,
        pessoaId: registro.pessoa_id,
        pessoaNome: registro.pessoa_nome,
        auditoriaId: registro.auditoria_id,
        pdfBuffer,
        itens: registro.itens || [],
        itensAlterados: registro.itens_alterados || [],
        origemLabel: "Docsales (assinatura eletrônica)",
      });

      await admin
        .from("docsales_esign_documentos")
        .update({
          status: "approved",
          atualizado_em: new Date().toISOString(),
          concluido_em: new Date().toISOString(),
          gpo_pendencia_id: pendenciaId,
        })
        .eq("id", registro.id);
    } catch (err: any) {
      console.error(`Falha ao finalizar Ficha de EPI assinada (documento ${documentoId}):`, err?.stack || err);
      return NextResponse.json({ error: `Falha ao finalizar: ${err?.message || err}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, finalizado: true });
  }

  // Qualquer outro status real (rejected/cancelled/expired/read/sent/active
  // /error) — só espelha no nosso registro, sem finalizar nada. Isso cobre
  // document_was_rejected, document_was_canceled, document_was_read e
  // document_was_partially_signed.
  await admin
    .from("docsales_esign_documentos")
    .update({ status: statusReal, atualizado_em: new Date().toISOString() })
    .eq("id", registro.id);

  return NextResponse.json({ ok: true, status: statusReal });
}
