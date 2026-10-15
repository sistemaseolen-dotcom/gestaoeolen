import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canView } from "@/lib/permissions";
import { calcularDivergenciasAuditoria, carregarFichasPorNome } from "@/lib/epiChecklist";

// Hidratação inicial da SPA — equivalente ao antigo `#seed-data` embutido na
// página. NÃO inclui usuarios nem audit_log (essa última é paginada à parte
// via /api/audit-log, pois só cresce e não faz sentido carregar tudo de uma
// vez). O front-end monta STATE.listas a partir de listas_opcoes agrupadas
// por `lista`.
// O PostgREST do Supabase limita cada resposta a um número máximo de linhas
// (configurado no projeto, geralmente 1000) mesmo sem LIMIT explícito no
// código — qualquer tabela que passe desse tamanho vem cortada em silêncio,
// sem erro. `treinamentos` já passou de 8000 linhas, então buscamos todas as
// tabelas em páginas de 1000 e concatenamos, em vez de confiar num único
// `select("*")`.
async function fetchAllRows(
  admin: ReturnType<typeof supabaseAdmin>,
  table: string,
  columns = "*",
  // Filtro de igualdade opcional (ex.: {column: "status", value: "CRESCIMENTO"})
  // -- usado pra buscar só o subconjunto de `pessoas` em crescimento, pra
  // quem tem permissão em "crescimento" mas não em "pessoas" (ver podeCrescimento
  // abaixo).
  eqFilter?: { column: string; value: any }
) {
  const pageSize = 1000;
  let from = 0;
  const all: any[] = [];
  for (;;) {
    let query = admin.from(table).select(columns).order("id").range(from, from + pageSize - 1);
    if (eqFilter) query = query.eq(eqFilter.column, eqFilter.value);
    const { data, error } = await query;
    if (error) return { data: null as any[] | null, error };
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null as any };
}

export async function GET() {
  const gate = await requireAuth();
  if (gate.response) return gate.response;

  const admin = supabaseAdmin();

  // Cada tabela de cadastro só é buscada do banco se o usuário logado tem
  // "ver" na página correspondente (revisão de segurança pedida pelo
  // Diego, 10/2026) — antes disso, só Auditorias e Acesso seguiam essa
  // regra, e TODO o resto (pessoas, empresas, patrimonios, equipes,
  // veiculos) era sempre devolvido pra qualquer usuário autenticado,
  // mesmo que a interface escondesse a aba: um usuário com permissão só
  // pra "ver" Auditorias, por exemplo, recebia no mesmo jeito o cadastro
  // completo de pessoas (nome + CPF) e de veículos de toda a empresa no
  // corpo desta resposta — só não aparecia na tela porque o app.js
  // escondia a aba, não porque o servidor negasse o dado. Um usuário
  // nessas condições conseguia ver tudo mesmo assim abrindo o painel de
  // rede do navegador. Daqui pra frente, a interface E o servidor negam
  // igual.
  //
  const podePessoas = canView(gate.user, "pessoas");
  const podeEmpresas = canView(gate.user, "empresas");
  const podePatrimonio = canView(gate.user, "patrimonio");
  const podeEquipes = canView(gate.user, "equipes");
  const podeVeiculos = canView(gate.user, "veiculos");
  // Auditorias só é buscada para quem tem acesso à página — comportamento
  // já existente, mantido como está.
  const podeAuditorias = canView(gate.user, "auditorias");
  // `treinamentos` não tem uma única página "dona": confirmado lendo o
  // app.js (10/2026) que esse mesmo array é usado em três telas diferentes,
  // cada uma com sua própria permissão —
  //   1. Painel/lista de Treinamentos (nav "Painel") -> canView("painel")
  //   2. Ficha da pessoa, dentro de Pessoas (pessoaTreinamentos()) -> "pessoas"
  //   3. Divergência de Ficha de EPI, dentro de Auditorias
  //      (buscarFichaEpiPessoa()) -> "auditorias"
  // Gatear só por "painel" (como cheguei a considerar antes) quebraria a
  // ficha da pessoa e a auditoria pra quem só tem uma dessas duas outras
  // permissões. Por isso o OR das três: só fica de fora quem não tem
  // nenhuma delas.
  const podeTreinamentos = canView(gate.user, "painel") || podePessoas || podeAuditorias;
  // Acesso guarda dados sensíveis (CPF e até senha de sistema de operadora)
  // — só busca do banco quando o usuário logado tem permissão "ver" nessa
  // página, mesmo padrão já usado acima para Auditorias.
  const podeAcesso = canView(gate.user, "acesso");
  // Aba "Crescimento" (pedido do Diego, 15/10/2026): quem só tem essa
  // permissão (sem "pessoas") precisa enxergar os cadastros em crescimento
  // mesmo assim -- buscamos à parte, só o subconjunto com status
  // CRESCIMENTO, igual ao padrão já usado acima pra "auditorias" com
  // pessoas (id, nome, cargo, status). Quem já tem "pessoas" não precisa
  // desta busca extra -- a lista cheia em `pessoas` já cobre.
  const podeCrescimento = canView(gate.user, "crescimento");

  const vazio = () => Promise.resolve({ data: [] as any[], error: null as any });

  // Bug relatado pelo Diego (10/2026, usuário Hebert Gonçalves de Souza):
  // quem só tem permissão em "auditorias" (sem "pessoas") ficava com a
  // lista de líder/colaborador da auditoria sempre vazia ("Nenhuma pessoa
  // encontrada.") -- efeito colateral do endurecimento de segurança acima.
  // A tela de Auditoria usa STATE.pessoas por dois motivos que não
  // precisam do cadastro completo (sem CPF): o combo de líder/colaborador
  // (pessoaComboHtml/colabInputsHtml, por nome+cargo+status) e a
  // divergência de Ficha de EPI (buscarFichaEpiPessoa, só por nome/id). Por
  // isso quem tem só "auditorias" recebe um subconjunto seguro (id, nome,
  // cargo, status) em vez do registro completo -- e quem não tem nenhuma
  // das duas permissões continua recebendo vazio, como antes.
  const [pessoas, empresas, treinamentos, equipes, equipeMembros, equipeCalibracoes, listasOpcoes, patrimonios, veiculos, veiculoKmLancamentos, auditorias, caDivergentesAuditorias, configuracoes, acessoEquipes, acessoMembros, crescimentoPessoasOnly] = await Promise.all([
    podePessoas
      ? fetchAllRows(admin, "pessoas")
      : podeAuditorias
      ? fetchAllRows(admin, "pessoas", "id, nome, cargo, status")
      : vazio(),
    podeEmpresas ? fetchAllRows(admin, "empresas") : vazio(),
    podeTreinamentos ? fetchAllRows(admin, "treinamentos") : vazio(),
    podeEquipes ? fetchAllRows(admin, "equipes") : vazio(),
    podeEquipes ? fetchAllRows(admin, "equipe_membros") : vazio(),
    podeEquipes ? fetchAllRows(admin, "equipe_calibracoes") : vazio(),
    fetchAllRows(admin, "listas_opcoes"),
    podePatrimonio ? fetchAllRows(admin, "patrimonios") : vazio(),
    podeVeiculos ? fetchAllRows(admin, "veiculos") : vazio(),
    podeVeiculos ? fetchAllRows(admin, "veiculo_km_lancamentos") : vazio(),
    podeAuditorias
      ? admin
          .from("auditorias")
          .select("id, standard, site_id, empresa, regional, data, status, inspetor_nome, num_colaboradores, tem_ca_divergente, tem_pendencia_assinatura, colaboradores, respostas, modalidade, criado_por_nome, criado_em, atualizado_em, finalizado_em")
          .order("data", { ascending: false })
      : vazio(),
    // Pedido do Diego (14/10/2026): mesmo quem só tem permissão em
    // "documentos" (sem "auditorias") precisa ver, na ficha da pessoa, um
    // aviso de que ela tem uma auditoria com CA divergente pendente — é o
    // que avisa, ANTES de subir uma Ficha de EPI nova, que aquele
    // documento tem algo pra conferir. Por isso esta busca é separada da
    // de `auditorias` acima (gateada só por "auditorias") e gateada por
    // "documentos" (podeTreinamentos) em vez disso -- inclui `respostas`
    // pra poder recalcular item a item logo abaixo (ver comentário perto
    // de `caDivergentePessoas`), nunca expõe os outros dados da auditoria
    // em si na resposta.
    podeTreinamentos
      ? admin.from("auditorias").select("respostas, colaboradores").eq("tem_ca_divergente", true)
      : vazio(),
    admin.from("configuracoes").select("chave, valor"),
    podeAcesso ? fetchAllRows(admin, "acesso_equipes") : vazio(),
    podeAcesso ? fetchAllRows(admin, "acesso_membros") : vazio(),
    podePessoas
      ? vazio() // já tem a lista completa em `pessoas` -- não precisa duplicar
      : podeCrescimento
      ? fetchAllRows(admin, "pessoas", "*", { column: "status", value: "CRESCIMENTO" })
      : vazio(),
  ]);

  for (const [name, res] of Object.entries({ pessoas, empresas, treinamentos, equipes, equipeMembros, equipeCalibracoes, listasOpcoes, patrimonios, veiculos, veiculoKmLancamentos, auditorias, caDivergentesAuditorias, configuracoes, acessoEquipes, acessoMembros, crescimentoPessoasOnly })) {
    if (res.error) {
      return NextResponse.json({ error: `Falha ao carregar ${name}: ${res.error.message}` }, { status: 500 });
    }
  }

  const membrosPorEquipe = new Map<number, any[]>();
  for (const m of equipeMembros.data || []) {
    const list = membrosPorEquipe.get(m.equipe_id) || [];
    list.push({ pessoaId: m.pessoa_id, pessoaNome: m.pessoa_nome, cargo: m.cargo });
    membrosPorEquipe.set(m.equipe_id, list);
  }
  const calibracoesPorEquipe = new Map<number, any[]>();
  for (const c of equipeCalibracoes.data || []) {
    const list = calibracoesPorEquipe.get(c.equipe_id) || [];
    list.push(c);
    calibracoesPorEquipe.set(c.equipe_id, list);
  }
  for (const list of calibracoesPorEquipe.values()) {
    list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }
  const equipesComMembros = (equipes.data || []).map((e) => ({
    ...e,
    membros: membrosPorEquipe.get(e.id) || [],
    calibracoes: calibracoesPorEquipe.get(e.id) || [],
  }));

  // Histórico de Kilometragem (pedido do Diego, 06/10/2026) — mesmo padrão
  // de equipeCalibracoes acima: agrupa por veiculo_id e embute em cada
  // veículo, pra não precisar de uma chamada à parte por veículo.
  const kmLancamentosPorVeiculo = new Map<number, any[]>();
  for (const l of veiculoKmLancamentos.data || []) {
    const list = kmLancamentosPorVeiculo.get(l.veiculo_id) || [];
    list.push(l);
    kmLancamentosPorVeiculo.set(l.veiculo_id, list);
  }
  const veiculosComKmLancamentos = (veiculos.data || []).map((v) => ({
    ...v,
    kmLancamentos: kmLancamentosPorVeiculo.get(v.id) || [],
  }));

  const listas: Record<string, string[]> = { cargo: [], tipoPessoa: [], statusPessoa: [], projeto: [] };
  for (const opt of listasOpcoes.data || []) {
    if (!listas[opt.lista]) listas[opt.lista] = [];
    listas[opt.lista].push(opt.valor);
  }

  const config: Record<string, any> = {};
  for (const row of configuracoes.data || []) config[row.chave] = row.valor;

  const membrosPorAcessoEquipe = new Map<number, any[]>();
  for (const m of acessoMembros.data || []) {
    const list = membrosPorAcessoEquipe.get(m.equipe_id) || [];
    list.push(m);
    membrosPorAcessoEquipe.set(m.equipe_id, list);
  }
  const acessoEquipesComMembros = (acessoEquipes.data || []).map((e) => ({
    ...e,
    membros: membrosPorAcessoEquipe.get(e.id) || [],
  }));

  // Nomes únicos de quem AINDA tem, pessoalmente, algum item de CA/
  // fabricação divergente agora — ver comentário na busca acima.
  //
  // Bug relatado pelo Diego (14/10/2026): a versão anterior marcava TODO
  // colaborador de uma auditoria com tem_ca_divergente=true, mesmo quem já
  // tinha corrigido a própria Ficha de EPI -- caso real: auditoria com
  // Janderson e Bruno, Janderson corrigiu a ficha dele (bateu 100% com o
  // que o auditor digitou), mas a auditoria continuou tem_ca_divergente=
  // true porque o Bruno ainda tinha itens não conferindo -- e o aviso
  // "CA divergente pendente" continuava aparecendo pro Janderson também,
  // mesmo a pendência sendo só do Bruno. `tem_ca_divergente` é um boolean
  // por AUDITORIA (existe pra decidir cor do item no gráfico de desvio do
  // Painel, que já é recalculado ao vivo por pessoa/item -- isso nunca
  // teve esse bug), não por colaborador -- não dá pra confiar nele sozinho
  // pra decidir quem, individualmente, ainda precisa de atenção.
  //
  // Por isso, pras poucas auditorias que ainda estão com tem_ca_divergente
  // =true (normalmente um punhado), recalcula aqui mesmo, item a item,
  // com a mesma função usada pelo botão "Gerar ficha de EPI"
  // (calcularDivergenciasAuditoria) -- só entra no aviso quem realmente
  // ainda tem pelo menos um item não conferindo, não todo mundo que
  // participou da auditoria.
  const nomesEmAuditoriasComDivergencia = Array.from(
    new Set((caDivergentesAuditorias.data || []).flatMap((a: any) => (a.colaboradores || []) as string[]))
  );
  const fichaPorNomeCaCheck = await carregarFichasPorNome(admin, nomesEmAuditoriasComDivergencia);
  const caDivergentePessoasSet = new Set<string>();
  for (const a of caDivergentesAuditorias.data || []) {
    const divergencias = calcularDivergenciasAuditoria((a as any).respostas, (a as any).colaboradores, fichaPorNomeCaCheck);
    for (const d of divergencias) caDivergentePessoasSet.add(d.nomeColaborador);
  }
  const caDivergentePessoas = Array.from(caDivergentePessoasSet);

  // Lista usada pela aba Crescimento: quem tem "pessoas" filtra a lista
  // completa no cliente (mesmo status CRESCIMENTO já está em `pessoas`);
  // quem só tem "crescimento" usa este subconjunto buscado à parte acima.
  const crescimentoPessoas = podePessoas
    ? (pessoas.data || []).filter((p: any) => p.status === "CRESCIMENTO")
    : crescimentoPessoasOnly.data || [];

  return NextResponse.json({
    pessoas: pessoas.data,
    crescimentoPessoas,
    empresas: empresas.data,
    treinamentos: treinamentos.data,
    equipes: equipesComMembros,
    patrimonios: patrimonios.data,
    veiculos: veiculosComKmLancamentos,
    auditorias: auditorias.data,
    caDivergentePessoas,
    listas,
    configuracoes: config,
    acessoEquipes: acessoEquipesComMembros,
  });
}
