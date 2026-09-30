// Passo final da assinatura eletrônica (Docsales) da Ficha de EPI —
// chamado pelo webhook (src/app/api/webhooks/docsales/route.ts) quando um
// documento volta com status "approved" (assinado de verdade).
//
// Pedido do Diego (23-24/09/2026): ao final, o comportamento tem que ser O
// MESMO de antes (quando a assinatura era feita na tela): substitui o
// anexo da Ficha de EPI dessa pessoa no Controle Eolen, entra na fila de
// "pendente de atualizar no GPO" (o GPO não tem escrita automatizada) e
// recalcula os indicadores da auditoria. Esta função é a extração exata
// dessa lógica (antes dentro de POST gerar-ficha-epi/route.ts, quando a
// finalização acontecia na hora — agora só acontece quando o Docsales
// confirma a assinatura, que pode ser dias depois).
import type { SupabaseClient } from "@supabase/supabase-js";
import * as storage from "./magaluStorage";
import { carregarFichasPorNome, normalizarEspecTexto, soDigitos, temAlgumaDivergencia } from "./epiChecklist";

export type ItemFichaEpiFinalizacao = {
  especificacao: string;
  ca: string;
  fabricacao?: string | null;
  alterado?: boolean;
};

export type FinalizarFichaEpiAssinadaInput = {
  treinamentoId: number;
  pessoaId: number | null;
  pessoaNome: string;
  auditoriaId: number | null;
  pdfBuffer: Buffer;
  itens: ItemFichaEpiFinalizacao[];
  itensAlterados: ItemFichaEpiFinalizacao[];
  // Quem/o que disparou a finalização — pro audit_log. Não é um usuário do
  // Controle Eolen (o webhook não tem sessão), então registra a origem.
  origemLabel: string;
};

export async function finalizarFichaEpiAssinada(
  admin: SupabaseClient,
  input: FinalizarFichaEpiAssinadaInput
): Promise<{ pendenciaId: number | null; treinamentoAtualizado: any }> {
  const { data: treino, error: treinoError } = await admin
    .from("treinamentos")
    .select("*")
    .eq("id", input.treinamentoId)
    .maybeSingle();
  if (treinoError) throw new Error(treinoError.message);
  if (!treino) throw new Error(`Treinamento ${input.treinamentoId} não encontrado.`);

  // Substitui o anexo — mesmo padrão de sempre: remove o antigo (best-effort)
  // antes de subir o novo (agora o PDF que voltou assinado do Docsales).
  if (treino.arquivo_path) {
    const { error: removeError } = await storage.removeFiles([treino.arquivo_path]);
    if (removeError) {
      console.error(`Falha ao remover Ficha de EPI anterior ${treino.arquivo_path}:`, removeError);
    }
  }
  const novoNome = `Ficha de EPI - ${input.pessoaNome} - assinada (Docsales).pdf`;
  const novoPath = `${storage.pessoaFolder(treino.pessoa_id, treino.pessoa_nome)}/${treino.id}-${Date.now()}-ficha-epi-assinada-docsales.pdf`;
  const { error: uploadError } = await storage.uploadFile(novoPath, input.pdfBuffer, "application/pdf");
  if (uploadError) throw new Error(`Falha ao salvar o PDF assinado: ${uploadError}`);

  const epiItensNovos = input.itens.map((it) => ({
    especificacao: normalizarEspecTexto(it.especificacao),
    ca: soDigitos(it.ca),
    fabricacao: (it.fabricacao || "").toString().trim() || null,
  }));

  const { data: treinoAtualizado, error: updateError } = await admin
    .from("treinamentos")
    .update({
      arquivo_path: novoPath,
      arquivo_nome: novoNome,
      epi_itens: epiItensNovos,
      epi_ocr_erro: null,
      epi_ocr_atualizado_em: new Date().toISOString(),
    })
    .eq("id", treino.id)
    .select()
    .single();
  if (updateError) throw new Error(updateError.message);

  // Fecha qualquer pendência de GPO anterior desta MESMA ficha ainda aberta
  // — o arquivo dela acabou de ser substituído.
  await admin
    .from("gpo_pendencias")
    .update({ regularizado: true, regularizado_em: new Date().toISOString() })
    .eq("treinamento_id", treino.id)
    .eq("regularizado", false);

  // Assinatura de verdade (Docsales, com validade jurídica) — diferente do
  // fluxo antigo (canvas), aqui NUNCA fica "assinatura_pendente": se
  // chegou até aqui é porque o Docsales confirmou a assinatura.
  const { data: pendencia, error: pendenciaError } = await admin
    .from("gpo_pendencias")
    .insert({
      treinamento_id: treino.id,
      pessoa_id: input.pessoaId,
      pessoa_nome: input.pessoaNome,
      auditoria_id: input.auditoriaId,
      arquivo_path: novoPath,
      itens_alterados: input.itensAlterados.map((it) => ({ especificacao: it.especificacao, ca: it.ca })),
      assinatura_pendente: false,
      criado_por_id: null,
      criado_por_nome: input.origemLabel,
    })
    .select()
    .single();
  if (pendenciaError) {
    console.error(`Falha ao criar pendência de GPO (treinamento ${treino.id}):`, pendenciaError.message);
  }

  // Recalcula os indicadores da auditoria (mesma lógica de sempre) — só
  // faz sentido se este envio veio de uma auditoria (pode não vir, ex.:
  // reenvio manual futuro sem auditoria associada).
  if (input.auditoriaId != null) {
    const { data: auditoria } = await admin.from("auditorias").select("*").eq("id", input.auditoriaId).maybeSingle();
    if (auditoria) {
      const { data: pendenciasAssinaturaAbertas } = await admin
        .from("gpo_pendencias")
        .select("id")
        .eq("auditoria_id", input.auditoriaId)
        .eq("regularizado", false)
        .eq("assinatura_pendente", true);
      const fichaPorNomeAtualizada = await carregarFichasPorNome(admin, auditoria.colaboradores || []);
      const aindaTemCaDivergente = temAlgumaDivergencia(auditoria.respostas, auditoria.colaboradores || [], fichaPorNomeAtualizada);
      await admin
        .from("auditorias")
        .update({
          tem_pendencia_assinatura: (pendenciasAssinaturaAbertas || []).length > 0,
          tem_ca_divergente: aindaTemCaDivergente,
        })
        .eq("id", input.auditoriaId);
    }
  }

  const resumoItens = input.itensAlterados.map((it) => `${it.especificacao}: CA -> ${it.ca}`).join("; ") || "—";
  await admin.from("audit_log").insert({
    entidade: "treinamento",
    entidade_id: treino.id,
    entidade_label: `FICHA DE EPI — ${input.pessoaNome}`,
    acao: "editar",
    campo: "epi_itens",
    campo_label: "Ficha de EPI assinada eletronicamente (Docsales)",
    de: input.auditoriaId != null ? `Auditoria #${input.auditoriaId}` : "—",
    para: resumoItens,
    usuario_id: null,
    usuario_nome: input.origemLabel,
  });

  return { pendenciaId: pendencia?.id ?? null, treinamentoAtualizado: treinoAtualizado };
}
