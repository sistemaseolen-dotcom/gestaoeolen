// Porta pro servidor dos itens de conferência de CA (Ficha de EPI) e da
// função `verificarCaItem` que já existem no checklist de auditoria em
// public/app.js (AUDITORIA_ITEMS_NOKIA / verificarCaItem). Mantido em
// sincronia manual com aquele arquivo de propósito — app.js é servido
// estático (public/) e não passa pelo bundler do Next, então não dá pra
// importar um do outro; qualquer novo item de CA-check (ou mudança nos
// especKeywords) precisa ser replicado nos dois lugares.
//
// Usado por:
//  - PATCH /api/auditorias/[id] — recalcular `tem_ca_divergente` sempre que
//    `respostas`/`status` mudam (ver rota).
//  - GET /api/auditorias/[id]/divergencias-epi e
//    POST /api/auditorias/[id]/gerar-ficha-epi — descobrir quais itens de
//    quais colaboradores estão "não confere" (pedido do Diego: gerar uma
//    nova Ficha de EPI com o CA corrigido pra esses itens).

export type CaCheckItem = {
  n: number;
  keyBase: string;
  especKeywords: string[];
  especKeywordsExcluir?: string[];
  caCheckLabel: string;
};

// Mesma lista/ordem de public/app.js (AUDITORIA_ITEMS_NOKIA, itens com
// `caCheck`) — só a parte relevante pra conferência de CA.
export const CA_CHECK_ITEMS: CaCheckItem[] = [
  { n: 16, keyBase: "ca_capacete", especKeywords: ["CAPACETE"], caCheckLabel: "Capacete" },
  { n: 18, keyBase: "ca_oculos", especKeywords: ["OCULOS"], caCheckLabel: "Óculos" },
  { n: 20, keyBase: "ca_luva", especKeywords: ["LUVA"], caCheckLabel: "Luva" },
  { n: 22, keyBase: "ca_cinto", especKeywords: ["CINTO"], caCheckLabel: "Cinto" },
  { n: 24, keyBase: "ca_travaquedas", especKeywords: ["TRAVA QUEDAS", "TRAVAQUEDAS"], caCheckLabel: "Trava-quedas" },
  // Pedido do Diego: a Ficha de EPI chama esse mesmo equipamento de
  // "POSICIONAMENTO" em vez de "TALABARTE" (é o mesmo item, nomes
  // diferentes) — ver o mesmo comentário em app.js.
  { n: 26, keyBase: "ca_talabarte_simples", especKeywords: ["TALABARTE", "POSICIONAMENTO"], especKeywordsExcluir: ["TALABARTE Y"], caCheckLabel: "Talabarte simples" },
  { n: 28, keyBase: "ca_talabarte_y", especKeywords: ["TALABARTE Y"], caCheckLabel: "Talabarte Y" },
  { n: 30, keyBase: "ca_botas", especKeywords: ["BOTA"], caCheckLabel: "Botas" },
];

// `fabricacao` (mês/ano de fabricação do equipamento, ex.: "01/2026") só
// existe pros itens de uma ficha já gerada por este sistema (nunca vem do
// OCR da ficha física — ver fichaEpiOcr.ts) — pedido do Diego (23/09/2026):
// item com CA novo (corrigido nesta auditoria) exige informar a fabricação
// de novo (é um equipamento diferente); item sem mudança de CA repete a
// fabricação já registrada, só editável se precisar corrigir.
export type ItemFichaEpi = { especificacao: string; ca: string; fabricacao?: string | null };

export type TreinamentoFichaEpi = {
  id: number;
  arquivo_path: string | null;
  epi_itens: ItemFichaEpi[] | null;
  epi_ocr_erro: string | null;
};

export type ResultadoCaCheck =
  | { status: "vazio" | "sem-colaborador" | "sem-ficha" }
  | { status: "ocr-falhou"; motivo: string; fichaId: number }
  | { status: "nao-encontrado" }
  | { status: "conforme"; caFicha: string; especFicha: string }
  | { status: "nao-conforme"; caFicha: string; especFicha: string };

// Pedido do Diego (23/09/2026): igual à conferência de CA, mas pra data de
// fabricação — o auditor digita o que está escrito no equipamento e o
// sistema compara com o que já está registrado na Ficha de EPI atual. Uma
// diferença aqui conta como divergência (gera ficha nova/assinatura) mesmo
// que o CA em si esteja certo. `sem-fabricacao-registrada` é o caso comum
// hoje (nenhuma ficha antiga tem fabricação capturada, só as regeneradas
// por este sistema a partir de agora) — tratado como "não dá pra conferir
// ainda", nunca como divergência (evitaria marcar TODA ficha antiga como
// divergente só por falta de dado histórico).
export type ResultadoFabricacaoCheck =
  | { status: "vazio" | "sem-colaborador" | "sem-ficha" }
  | { status: "ocr-falhou"; motivo: string; fichaId: number }
  | { status: "nao-encontrado" }
  | { status: "sem-fabricacao-registrada"; especFicha: string }
  | { status: "conforme"; fabricacaoFicha: string; especFicha: string }
  | { status: "nao-conforme"; fabricacaoFicha: string; especFicha: string };

export function soDigitos(s: string | null | undefined): string {
  return (s || "").toString().replace(/\D/g, "");
}

export function normalizarEspecTexto(s: string | null | undefined): string {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Mês/ano de fabricação, ex.: "01/2026" — normaliza pra comparar (remove
// espaços, aceita "1/2026" ou "01/26" tratando como não-comparável — só
// confia no formato certinho MM/AAAA, o mesmo exigido na tela de assinatura).
export function normalizarFabricacao(s: string | null | undefined): string {
  const t = (s || "").toString().trim();
  return /^\d{2}\/\d{4}$/.test(t) ? t : "";
}

function encontrarItemFicha(caCheck: CaCheckItem, ficha: TreinamentoFichaEpi): ItemFichaEpi | null {
  const keywords = caCheck.especKeywords || [];
  const excluir = caCheck.especKeywordsExcluir || [];
  const achados = (ficha.epi_itens || []).filter((it) => {
    const esp = normalizarEspecTexto(it.especificacao);
    const bate = keywords.some((k) => esp.indexOf(k) !== -1);
    if (!bate) return false;
    const excluido = excluir.some((k) => esp.indexOf(k) !== -1);
    return !excluido;
  });
  return achados[0] || null;
}

export function verificarCaItem(
  caCheck: CaCheckItem,
  nomeColaborador: string | null | undefined,
  caDigitado: string | null | undefined,
  ficha: TreinamentoFichaEpi | null
): ResultadoCaCheck {
  const digitado = soDigitos(caDigitado);
  if (!nomeColaborador) return { status: "sem-colaborador" };
  if (!digitado) return { status: "vazio" };
  if (!ficha || !ficha.arquivo_path) return { status: "sem-ficha" };
  if (!ficha.epi_itens || !ficha.epi_itens.length) {
    return { status: "ocr-falhou", motivo: ficha.epi_ocr_erro || "Leitura automática da ficha ainda não disponível.", fichaId: ficha.id };
  }
  const achado = encontrarItemFicha(caCheck, ficha);
  if (!achado) return { status: "nao-encontrado" };
  const caFicha = soDigitos(achado.ca);
  const especFicha = achado.especificacao;
  if (digitado === caFicha) return { status: "conforme", caFicha, especFicha };
  return { status: "nao-conforme", caFicha, especFicha };
}

export function verificarFabricacaoItem(
  caCheck: CaCheckItem,
  nomeColaborador: string | null | undefined,
  fabricacaoDigitada: string | null | undefined,
  ficha: TreinamentoFichaEpi | null
): ResultadoFabricacaoCheck {
  const digitado = normalizarFabricacao(fabricacaoDigitada);
  if (!nomeColaborador) return { status: "sem-colaborador" };
  if (!digitado) return { status: "vazio" };
  if (!ficha || !ficha.arquivo_path) return { status: "sem-ficha" };
  if (!ficha.epi_itens || !ficha.epi_itens.length) {
    return { status: "ocr-falhou", motivo: ficha.epi_ocr_erro || "Leitura automática da ficha ainda não disponível.", fichaId: ficha.id };
  }
  const achado = encontrarItemFicha(caCheck, ficha);
  if (!achado) return { status: "nao-encontrado" };
  const especFicha = achado.especificacao;
  const fabricacaoFicha = normalizarFabricacao(achado.fabricacao);
  if (!fabricacaoFicha) return { status: "sem-fabricacao-registrada", especFicha };
  if (digitado === fabricacaoFicha) return { status: "conforme", fabricacaoFicha, especFicha };
  return { status: "nao-conforme", fabricacaoFicha, especFicha };
}

export type DivergenciaColaborador = {
  colabIdx: number; // 1-based, igual data-colab-idx em app.js
  nomeColaborador: string;
  itens: {
    caCheck: CaCheckItem;
    especFichaAtual: string; // texto exato da linha da ficha que bateu — usado pra achar a linha certa (CAs repetidos entre linhas, ex.: cinto/talabarte y/trava-quedas costumam compartilhar o mesmo número, então só comparar CA não basta)
    // CA: null quando só a fabricação divergiu (CA em si está certo).
    caFichaAtual: string | null;
    caNovo: string | null;
    // Fabricação: null quando só o CA divergiu (nenhuma fabricação nova
    // capturada pelo auditor pra esse item nesta auditoria).
    fabricacaoNova: string | null;
  }[];
};

// `respostas` é o JSON bruto da coluna `auditorias.respostas`; `colaboradores`
// é o array de nomes (`auditorias.colaboradores`); `fichaPorNome` resolve
// nome -> treinamento "FICHA DE EPI" já carregado (pra não buscar 1 por 1).
export function calcularDivergenciasAuditoria(
  respostas: Record<string, any> | null | undefined,
  colaboradores: string[] | null | undefined,
  fichaPorNome: Map<string, TreinamentoFichaEpi | null>
): DivergenciaColaborador[] {
  const nomes = colaboradores || [];
  const out: DivergenciaColaborador[] = [];
  const r = respostas || {};

  for (let colabIdx = 1; colabIdx <= nomes.length; colabIdx++) {
    const nomeColaborador = nomes[colabIdx - 1] || "";
    if (!nomeColaborador) continue;
    const ficha = fichaPorNome.get(nomeColaborador) ?? null;
    const itens: DivergenciaColaborador["itens"] = [];

    for (const caCheck of CA_CHECK_ITEMS) {
      const caDigitado = (r[`${caCheck.keyBase}_${colabIdx}`] || "").toString();
      const fabKeyBase = caCheck.keyBase.replace(/^ca_/, "fab_");
      const fabDigitada = (r[`${fabKeyBase}_${colabIdx}`] || "").toString();

      const resultadoCa = verificarCaItem(caCheck, nomeColaborador, caDigitado, ficha);
      const resultadoFab = verificarFabricacaoItem(caCheck, nomeColaborador, fabDigitada, ficha);

      const caDivergente = resultadoCa.status === "nao-conforme";
      const fabDivergente = resultadoFab.status === "nao-conforme";
      if (!caDivergente && !fabDivergente) continue;

      // A especificação/CA "atual" pra achar a linha certa na ficha: vem de
      // qualquer um dos dois resultados que tenha achado a linha (os dois
      // procuram a MESMA linha, então nunca discordam sobre ela).
      const especFichaAtual = (resultadoCa as any).especFicha || (resultadoFab as any).especFicha || "";
      const caFichaAtual = (resultadoCa as any).caFicha ?? null;

      itens.push({
        caCheck,
        especFichaAtual,
        caFichaAtual,
        caNovo: caDivergente ? soDigitos(caDigitado) : null,
        fabricacaoNova: fabDivergente ? normalizarFabricacao(fabDigitada) : null,
      });
    }

    if (itens.length) out.push({ colabIdx, nomeColaborador, itens });
  }

  return out;
}

export function temAlgumaDivergencia(
  respostas: Record<string, any> | null | undefined,
  colaboradores: string[] | null | undefined,
  fichaPorNome: Map<string, TreinamentoFichaEpi | null>
): boolean {
  return calcularDivergenciasAuditoria(respostas, colaboradores, fichaPorNome).length > 0;
}

// Helper comum às rotas: carrega, pros nomes de colaboradores de uma
// auditoria, o respectivo treinamento "FICHA DE EPI" (por nome exato — é
// assim que `auditorias.colaboradores` guarda quem participou, sem FK pra
// `pessoas`; mesma heurística de `buscarFichaEpiPessoa` em app.js).
export async function carregarFichasPorNome(
  admin: any,
  colaboradores: string[]
): Promise<Map<string, TreinamentoFichaEpi | null>> {
  const nomes = Array.from(new Set((colaboradores || []).filter(Boolean)));
  const mapa = new Map<string, TreinamentoFichaEpi | null>();
  if (!nomes.length) return mapa;

  const { data: pessoas } = await admin.from("pessoas").select("id, nome").in("nome", nomes);
  const pessoaIdPorNome = new Map<string, number>();
  (pessoas || []).forEach((p: any) => pessoaIdPorNome.set(p.nome, p.id));

  const pessoaIds = Array.from(pessoaIdPorNome.values());
  nomes.forEach((n) => mapa.set(n, null));
  if (!pessoaIds.length) return mapa;

  const { data: fichas } = await admin
    .from("treinamentos")
    .select("id, pessoa_id, arquivo_path, epi_itens, epi_ocr_erro")
    .in("pessoa_id", pessoaIds)
    .eq("tipo", "FICHA DE EPI");

  const fichaPorPessoaId = new Map<number, TreinamentoFichaEpi>();
  (fichas || []).forEach((f: any) => fichaPorPessoaId.set(f.pessoa_id, f));

  nomes.forEach((nome) => {
    const pessoaId = pessoaIdPorNome.get(nome);
    if (pessoaId !== undefined) {
      mapa.set(nome, fichaPorPessoaId.get(pessoaId) || null);
    }
  });

  return mapa;
}
