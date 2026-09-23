import { NextResponse } from "next/server";
import { requireView } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { calcularDivergenciasAuditoria, carregarFichasPorNome } from "@/lib/epiChecklist";

// Pedido do Diego: depois de uma auditoria com CA não conforme, gerar uma
// Ficha de EPI nova (mesmo padrão do formulário, com o CA corrigido e
// assinatura na tela). Esta rota monta os dados pras duas telas desse
// fluxo: a lista de colaboradores com divergência (view=lista, usada só o
// resumo) e a ficha completa de UM colaborador pra assinar (view=ficha).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireView("auditorias");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: auditoria, error } = await admin.from("auditorias").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!auditoria) return NextResponse.json({ error: "Auditoria não encontrada." }, { status: 404 });

  const colaboradores: string[] = auditoria.colaboradores || [];
  const fichaPorNome = await carregarFichasPorNome(admin, colaboradores);
  const divergencias = calcularDivergenciasAuditoria(auditoria.respostas, colaboradores, fichaPorNome);

  if (!divergencias.length) {
    return NextResponse.json({ auditoriaId: id, colaboradores: [] });
  }

  // Dados de pessoa/empresa pro cabeçalho da ficha (CPF, empresa, CNPJ,
  // função) — só busca de quem realmente tem divergência.
  const nomesComDivergencia = divergencias.map((d) => d.nomeColaborador);
  const { data: pessoas } = await admin
    .from("pessoas")
    .select("id, nome, cpf, cargo, empresa_id, empresa_nome")
    .in("nome", nomesComDivergencia);
  const pessoaPorNome = new Map((pessoas || []).map((p: any) => [p.nome, p]));

  const empresaIds = Array.from(new Set((pessoas || []).map((p: any) => p.empresa_id).filter((v: any) => v != null)));
  const { data: empresas } = empresaIds.length
    ? await admin.from("empresas").select("id, cnpj").in("id", empresaIds)
    : { data: [] as any[] };
  const cnpjPorEmpresaId = new Map((empresas || []).map((e: any) => [e.id, e.cnpj]));

  const url = new URL(req.url);
  const somenteNome = url.searchParams.get("colaborador");

  const resultado = divergencias
    .filter((d) => !somenteNome || d.nomeColaborador === somenteNome)
    .map((d) => {
      const ficha = fichaPorNome.get(d.nomeColaborador) || null;
      const pessoa = pessoaPorNome.get(d.nomeColaborador) as any;
      const itensAtuais = (ficha?.epi_itens || []) as { especificacao: string; ca: string }[];

      // Marca, dentro da lista COMPLETA de itens da ficha atual (todos os
      // ~9-20 equipamentos), qual linha exata é a que a auditoria achou
      // divergente — pra ficha nova repetir os outros como estão hoje e só
      // trocar o CA desse (decisão do Diego). Casa pelo texto exato da
      // especificação (`especFichaAtual`, o mesmo valor que já saiu do
      // filtro de keywords em verificarCaItem) em vez do número do CA,
      // porque várias linhas costumam repetir o MESMO CA (ex.: cinto,
      // talabarte Y, trava-quedas e mosquetão saem todos com o CA do kit) —
      // comparar por CA marcaria todas elas como divergentes por engano.
      //
      // Cada divergência reivindica a PRIMEIRA linha ainda não reivindicada
      // com aquele texto exato (se a ficha tiver duas linhas iguais, ex.
      // duas "LUVA", é a mesma ambiguidade que a própria verificação de CA
      // já tem hoje — pega sempre a primeira).
      const divergentePorIndice = new Map<number, (typeof d.itens)[number]>();
      for (const di of d.itens) {
        const idx = itensAtuais.findIndex((it, i) => it.especificacao === di.especFichaAtual && !divergentePorIndice.has(i));
        if (idx !== -1) divergentePorIndice.set(idx, di);
      }

      const itens = itensAtuais.map((it, idx) => {
        const divergente = divergentePorIndice.get(idx) || null;
        return {
          especificacao: it.especificacao,
          ca: it.ca,
          divergente: !!divergente,
          caNovo: divergente ? divergente.caNovo : null,
          caCheckLabel: divergente ? divergente.caCheck.caCheckLabel : null,
        };
      });

      return {
        colabIdx: d.colabIdx,
        nomeColaborador: d.nomeColaborador,
        qtdItensDivergentes: d.itens.length,
        pessoa: pessoa
          ? { id: pessoa.id, cpf: pessoa.cpf, cargo: pessoa.cargo, empresaNome: pessoa.empresa_nome, cnpj: pessoa.empresa_id ? cnpjPorEmpresaId.get(pessoa.empresa_id) || null : null }
          : null,
        itens,
      };
    });

  return NextResponse.json({ auditoriaId: id, colaboradores: resultado });
}
