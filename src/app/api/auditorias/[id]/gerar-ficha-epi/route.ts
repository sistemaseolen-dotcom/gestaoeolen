import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizarEspecTexto, soDigitos } from "@/lib/epiChecklist";
import { gerarFichaEpiPdf, type ItemFichaGerada } from "@/lib/gerarFichaEpiPdf";

const BUCKET = "treinamentos-anexos";

type ItemBody = {
  especificacao: string;
  ca: string;
  qtd?: string;
  fabricacao?: string;
  entrega?: string;
  assinaturaPngBase64?: string;
  alterado?: boolean;
};

// Pedido do Diego: depois de uma auditoria achar um CA que não confere,
// gerar uma Ficha de EPI nova (mesmo padrão do formulário) já com o CA
// corrigido e a assinatura feita na tela (com o dedo), item por item — sem
// precisar imprimir e assinar em papel de novo. Esta rota:
//  1) gera o PDF (src/lib/gerarFichaEpiPdf.ts);
//  2) substitui o anexo da Ficha de EPI dessa pessoa no Controle Eolen
//     (arquivo + epi_itens, pra próxima conferência de CA já usar os
//     valores novos — decisão do Diego: substitui direto, sem manter a
//     versão anterior);
//  3) entra na fila de "pendente de atualizar no GPO" (gpo_pendencias) —
//     o GPO (sistema do cliente) não tem escrita automatizada, só leitura
//     (ver src/lib/gpoSync.ts), então esse upload lá é manual; o indicador
//     do Painel usa essa fila pra avisar o que ainda falta subir.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("auditorias", "editar");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const nomeColaborador = (body?.nomeColaborador || "").toString().trim();
  if (!nomeColaborador) {
    return NextResponse.json({ error: "Informe o colaborador." }, { status: 400 });
  }
  const itensBody: ItemBody[] = Array.isArray(body?.itens) ? body.itens : [];
  if (!itensBody.length) {
    return NextResponse.json({ error: "Informe os itens da ficha." }, { status: 400 });
  }
  for (const it of itensBody) {
    if (!it.especificacao || !it.ca) {
      return NextResponse.json({ error: "Todo item precisa de especificação e CA." }, { status: 400 });
    }
    if (!it.assinaturaPngBase64) {
      return NextResponse.json({ error: `Falta a assinatura do item "${it.especificacao}".` }, { status: 400 });
    }
  }

  const admin = supabaseAdmin();

  const { data: auditoria, error: auditoriaError } = await admin.from("auditorias").select("*").eq("id", id).maybeSingle();
  if (auditoriaError) return NextResponse.json({ error: auditoriaError.message }, { status: 500 });
  if (!auditoria) return NextResponse.json({ error: "Auditoria não encontrada." }, { status: 404 });
  if (!(auditoria.colaboradores || []).includes(nomeColaborador)) {
    return NextResponse.json({ error: "Esse colaborador não faz parte desta auditoria." }, { status: 400 });
  }

  const { data: pessoa, error: pessoaError } = await admin
    .from("pessoas")
    .select("id, nome, cpf, cargo, empresa_id, empresa_nome")
    .eq("nome", nomeColaborador)
    .maybeSingle();
  if (pessoaError) return NextResponse.json({ error: pessoaError.message }, { status: 500 });
  if (!pessoa) return NextResponse.json({ error: "Pessoa não encontrada no cadastro." }, { status: 404 });

  const { data: treino, error: treinoError } = await admin
    .from("treinamentos")
    .select("*")
    .eq("pessoa_id", pessoa.id)
    .eq("tipo", "FICHA DE EPI")
    .maybeSingle();
  if (treinoError) return NextResponse.json({ error: treinoError.message }, { status: 500 });
  if (!treino) {
    return NextResponse.json({ error: "Essa pessoa não tem um registro de Ficha de EPI para atualizar." }, { status: 404 });
  }

  let cnpj: string | null = null;
  let cidade: string | null = null;
  if (pessoa.empresa_id) {
    const { data: empresa } = await admin.from("empresas").select("cnpj, cidade").eq("id", pessoa.empresa_id).maybeSingle();
    cnpj = empresa?.cnpj || null;
    cidade = empresa?.cidade || null;
  }

  const itensPdf: ItemFichaGerada[] = itensBody.map((it) => ({
    especificacao: it.especificacao,
    ca: soDigitos(it.ca),
    qtd: it.qtd || "1",
    fabricacao: it.fabricacao || "",
    entrega: it.entrega || "",
    assinaturaPngBase64: it.assinaturaPngBase64 || null,
    alterado: !!it.alterado,
  }));

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await gerarFichaEpiPdf({
      pessoaNome: pessoa.nome,
      cpf: pessoa.cpf,
      empresaNome: pessoa.empresa_nome,
      cnpj,
      cidade,
      funcao: pessoa.cargo,
      itens: itensPdf,
    });
  } catch (err: any) {
    console.error(`Falha ao gerar PDF da Ficha de EPI (treinamento ${treino.id}):`, err?.stack || err);
    return NextResponse.json({ error: `Falha ao gerar o PDF: ${err?.message || err}` }, { status: 500 });
  }

  // Substitui o anexo — mesmo padrão de POST /api/treinamentos/[id]/arquivo:
  // remove o antigo (best-effort) antes de subir o novo.
  if (treino.arquivo_path) {
    const { error: removeError } = await admin.storage.from(BUCKET).remove([treino.arquivo_path]);
    if (removeError) {
      console.error(`Falha ao remover Ficha de EPI anterior ${treino.arquivo_path}:`, removeError.message);
    }
  }
  const novoNome = `Ficha de EPI - ${pessoa.nome} - regenerada.pdf`;
  const novoPath = `${treino.id}/${Date.now()}-ficha-epi-regenerada.pdf`;
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(novoPath, pdfBuffer, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ error: `Falha ao salvar o novo PDF: ${uploadError.message}` }, { status: 500 });
  }

  const epiItensNovos = itensPdf.map((it) => ({ especificacao: normalizarEspecTexto(it.especificacao), ca: soDigitos(it.ca) }));

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
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const itensAlterados = itensPdf.filter((it) => it.alterado);

  const { data: pendencia, error: pendenciaError } = await admin
    .from("gpo_pendencias")
    .insert({
      treinamento_id: treino.id,
      pessoa_id: pessoa.id,
      pessoa_nome: pessoa.nome,
      auditoria_id: id,
      arquivo_path: novoPath,
      itens_alterados: itensAlterados.map((it) => ({ especificacao: it.especificacao, ca: it.ca })),
      criado_por_id: gate.user?.id ?? null,
      criado_por_nome: gate.user?.nome ?? null,
    })
    .select()
    .single();
  if (pendenciaError) {
    // O PDF/anexo já foi atualizado com sucesso — não desfaz por causa de
    // uma falha só na fila de pendências do GPO, mas avisa no retorno.
    console.error(`Falha ao criar pendência de GPO (treinamento ${treino.id}):`, pendenciaError.message);
  }

  const resumoItens = itensAlterados.map((it) => `${it.especificacao}: CA -> ${it.ca}`).join("; ") || "—";
  await admin.from("audit_log").insert({
    entidade: "treinamento",
    entidade_id: treino.id,
    entidade_label: `FICHA DE EPI — ${pessoa.nome}`,
    acao: "editar",
    campo: "epi_itens",
    campo_label: "Ficha de EPI regenerada (auditoria)",
    de: `Auditoria #${id}`,
    para: resumoItens,
    usuario_id: gate.user?.id ?? null,
    usuario_nome: gate.user?.nome ?? "—",
  });

  return NextResponse.json({
    treinamento: treinoAtualizado,
    pendenciaId: pendencia?.id ?? null,
  });
}
