import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canView } from "@/lib/permissions";

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
async function fetchAllRows(admin: ReturnType<typeof supabaseAdmin>, table: string) {
  const pageSize = 1000;
  let from = 0;
  const all: any[] = [];
  for (;;) {
    const { data, error } = await admin.from(table).select("*").order("id").range(from, from + pageSize - 1);
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

  const vazio = () => Promise.resolve({ data: [] as any[], error: null as any });

  const [pessoas, empresas, treinamentos, equipes, equipeMembros, equipeCalibracoes, listasOpcoes, patrimonios, veiculos, veiculoKmLancamentos, auditorias, configuracoes, acessoEquipes, acessoMembros] = await Promise.all([
    podePessoas ? fetchAllRows(admin, "pessoas") : vazio(),
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
    admin.from("configuracoes").select("chave, valor"),
    podeAcesso ? fetchAllRows(admin, "acesso_equipes") : vazio(),
    podeAcesso ? fetchAllRows(admin, "acesso_membros") : vazio(),
  ]);

  for (const [name, res] of Object.entries({ pessoas, empresas, treinamentos, equipes, equipeMembros, equipeCalibracoes, listasOpcoes, patrimonios, veiculos, veiculoKmLancamentos, auditorias, configuracoes, acessoEquipes, acessoMembros })) {
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

  return NextResponse.json({
    pessoas: pessoas.data,
    empresas: empresas.data,
    treinamentos: treinamentos.data,
    equipes: equipesComMembros,
    patrimonios: patrimonios.data,
    veiculos: veiculosComKmLancamentos,
    auditorias: auditorias.data,
    listas,
    configuracoes: config,
    acessoEquipes: acessoEquipesComMembros,
  });
}
