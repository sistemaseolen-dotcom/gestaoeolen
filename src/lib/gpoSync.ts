// Sincronização unidirecional GPO (sistema antigo, https://gpoeolen.rbasolucoes.com.br)
// -> Supabase (Controle Eolen). O GPO é a fonte "viva": ele é atualizado
// constantemente pela operação, enquanto o Controle Eolen deveria refletir
// esses dados. Os IDs internos do GPO (idpessoa / id de empresa) já batem
// 1:1 com os IDs usados nas tabelas `pessoas` e `empresas` deste banco (a
// migração inicial foi feita a partir de uma exportação do próprio GPO), o
// que permite um UPSERT direto por id, sem heurística de nome.
//
// `equipes`/`equipe_membros` e `treinamentos` não têm essa correspondência
// de id (o GPO não expõe um id estável de "equipe", e o histórico de
// treinamentos é uma lista achatada por pessoa+tipo) — para essas duas,
// cada sincronização apaga e reconstrói o conjunto inteiro a partir do GPO,
// igual ao processo validado na migração inicial. Isso significa que o id
// interno de uma equipe pode mudar entre sincronizações (não há nada mais
// no banco que referencie esse id além de equipe_membros, que é reconstruído
// junto).
//
// IMPORTANTE: a API do GPO (apigpoeollen.rbasolucoes.com.br:8148) não exige
// nenhuma autenticação — está aberta. Isso é uma falha do sistema antigo,
// não deste código; vale reportar ao fornecedor (RBA Soluções).

import { supabaseAdmin } from "./supabaseAdmin";

const GPO_BASE = process.env.GPO_API_BASE || "https://apigpoeollen.rbasolucoes.com.br:8148/v1";
const GPO_QS = `idcliente=${process.env.GPO_IDCLIENTE || "1"}&idusuario=${process.env.GPO_IDUSUARIO || "22"}&idloja=${process.env.GPO_IDLOJA || "1"}`;

async function gpoFetch(path: string): Promise<any[]> {
  const res = await fetch(`${GPO_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`GPO API respondeu ${res.status} em ${path}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`GPO API retornou formato inesperado em ${path}`);
  }
  return data;
}

/* ---------------- Helpers de normalização ---------------- */

function normStr(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function normNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Datas do GPO vêm em dois formatos conforme o endpoint: "YYYY-MM-DD..."
// (cadastro/pessoa) ou "DD/MM/YYYY" (treinamentogeral). Datas "vazias" no
// GPO aparecem como 1899-12-30 (sentinela) — tratamos como null, igual à
// migração inicial.
function normDate(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [yy, mm, dd] = s.slice(0, 10).split("-").map(Number);
    y = yy; m = mm; d = dd;
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yy] = s.split("/").map(Number);
    y = yy; m = mm; d = dd;
  } else {
    return null;
  }
  if (!y || y <= 1900) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function empresaTitle(e: { fantasia?: string | null; nome?: string | null; cnpj?: string | null } | undefined): string {
  if (!e) return "Empresa sem nome";
  return e.fantasia || e.nome || (e.cnpj ? `CNPJ ${e.cnpj}` : "") || "Empresa sem nome";
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// O PostgREST do Supabase corta cada resposta num número máximo de linhas
// (config do projeto, hoje 1000) mesmo sem LIMIT no código. `pessoas` já
// passou de 890 registros e só tende a crescer — sem paginar aqui, ao
// ultrapassar o teto o `idsValidos` (usado por syncEquipes/syncTreinamentos
// pra saber quais pessoa_id existem) ficaria incompleto, e membros/
// treinamentos de gente recém-cadastrada seriam descartados como "órfãos"
// silenciosamente — a mesma classe de bug que cortou os treinamentos.
async function fetchAllIds(admin: ReturnType<typeof supabaseAdmin>, table: string): Promise<number[]> {
  const pageSize = 1000;
  let from = 0;
  const ids: number[] = [];
  for (;;) {
    const { data, error } = await admin.from(table).select("id").range(from, from + pageSize - 1);
    if (error) throw new Error(`Falha ao carregar ids de ${table}: ${error.message}`);
    (data || []).forEach((r: any) => ids.push(r.id));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

/* ---------------- Treinamentos: tipos/categoria ---------------- */

const TIPO_CATEGORIA: Record<string, "documento" | "treinamento"> = {
  "ASO": "documento",
  "CNH": "documento",
  "CONTRATO": "documento",
  "FICHA DE EPI": "documento",
  "INTEGRAÇÃO DE SEGURANÇA": "treinamento",
  "NR-33 - SEGURANÇA E SAÚDE NO TRABALHO EM ESPAÇOS CONFINADOS": "treinamento",
  "NR06": "treinamento",
  "NR10": "treinamento",
  "NR18 (ANDAIME)": "treinamento",
  "NR18 (CADEIRINHA)": "treinamento",
  "NR18 (TRABALHO A QUENTE)": "treinamento",
  "NR18 - SOLDAGEM E CORTE A QUENTE": "treinamento",
  "NR20 - INFLAMÁVEIS E COMBUSTÍVEIS": "treinamento",
  "NR35": "treinamento",
  "ORDEM DE SERVIÇO (NR01)": "documento",
  "PCMSO": "documento",
  "PGR": "documento",
  "PRIMEIROS SOCORROS": "treinamento",
  "RESGATE EM ALTURA - NR35": "treinamento",
  "SEGURO": "documento",
  "TERMO DE CONSENTIMENTO": "documento",
};

const TIPO_FIX_MAP: Record<string, string> = {
  "ORDEM DE SERVIÇO": "ORDEM DE SERVIÇO (NR01)",
  "TERMO DE CONSCENTIMENTO": "TERMO DE CONSENTIMENTO",
  "INTEGRAÇÃO SEGURANÇA": "INTEGRAÇÃO DE SEGURANÇA",
  "NR20 - INFLAMÁVEIS E COMBUSTIVEIS": "NR20 - INFLAMÁVEIS E COMBUSTÍVEIS",
};

function normTipo(raw: any): string | null {
  const t = normStr(raw);
  if (!t) return null;
  if (TIPO_CATEGORIA[t]) return t;
  if (TIPO_FIX_MAP[t]) return TIPO_FIX_MAP[t];
  return null;
}

/* ---------------- Resultado ---------------- */

export type SyncResumo = {
  empresas: { total: number; erros: number };
  pessoas: { total: number; erros: number };
  equipes: { totalEquipes: number; totalMembros: number; membrosOrfaos: number };
  treinamentos: { totalOriginal: number; totalFinal: number; duplicadosRemovidos: number; tiposDesconhecidos: string[]; orfaos: number };
};

/* ---------------- Empresas ---------------- */

async function syncEmpresas(): Promise<SyncResumo["empresas"]> {
  const rows = await gpoFetch(`/empresas?busca=&${GPO_QS}&deletado=0`);
  const admin = supabaseAdmin();
  let erros = 0;

  const payloads = rows.map((r) => ({
    id: normNum(r.id),
    nome: normStr(r.nome) || `Empresa ${r.id}`,
    fantasia: normStr(r.fantasia),
    cnpj: normStr(r.cnpj),
    porte: normStr(r.porte),
    cidade: normStr(r.cidade),
    uf: normStr(r.uf),
    cep: normStr(r.cep),
    bairro: normStr(r.bairro),
    logradouro: normStr(r.logradouro),
    numero: normStr(r.numero),
    telefone: normStr(r.telefone),
    email: normStr(r.email),
    nome_responsavel: normStr(r.nomeresponsavel),
    regional: normStr(r.regional),
    cnae_principal: normStr(r.cnae1),
    cnae_descricao: normStr(r.cnaedescricao1),
    pgr: normStr(r.pgr),
    pcmso: normStr(r.pcmso),
    situacao_cadastral: normStr(r.situacaocadastral),
    status: normStr(r.status) || "ATIVO",
    contratos: normStr(r.contratos),
    tipo_pj: normStr(r.tipopj),
  })).filter((p) => p.id !== null);

  for (const batch of chunk(payloads, 500)) {
    const { error } = await admin.from("empresas").upsert(batch, { onConflict: "id" });
    if (error) { erros += batch.length; }
  }

  return { total: payloads.length, erros };
}

/* ---------------- Pessoas ---------------- */

async function syncPessoas(): Promise<SyncResumo["pessoas"]> {
  const rows = await gpoFetch(`/pessoa?busca=&${GPO_QS}&status1=&tipopessoa1=&deletado=0`);
  const admin = supabaseAdmin();
  let erros = 0;

  // Mapa de empresas já sincronizadas, pra resolver empresa_nome sem 1 query por pessoa.
  const { data: empresas } = await admin.from("empresas").select("id, nome, fantasia, cnpj");
  const empresaMap = new Map<number, { nome: string | null; fantasia: string | null; cnpj: string | null }>();
  (empresas || []).forEach((e: any) => empresaMap.set(e.id, e));

  const payloads = rows.map((r) => {
    const empresaIdNum = normNum(r.empresa);
    const empresaRow = empresaIdNum !== null ? empresaMap.get(empresaIdNum) : undefined;
    const empresaId = empresaRow ? empresaIdNum : null;

    return {
      id: normNum(r.id ?? r.idpessoa),
      nome: normStr(r.nome) || `Pessoa ${r.id}`,
      tipo_pessoa: normStr(r.tipopessoa),
      regional: normStr(r.regional),
      cadastro: normStr(r.cadastro),
      data_admissao: normDate(r.dataadmissao),
      data_demissao: normDate(r.datademissao),
      matricula_esocial: normStr(r.matriculaesocial),
      cbo: normStr(r.cbo),
      empresa_id: empresaId,
      empresa_nome: empresaId !== null ? empresaTitle(empresaRow) : null,
      cargo: normStr(r.cargo),
      email: normStr(r.email),
      telefone: normStr(r.telefone),
      email_corporativo: normStr(r.emailcorporativo),
      telefone_corporativo: normStr(r.telefonecorporativo),
      sexo: normStr(r.sexo),
      data_nascimento: normDate(r.datanascimento),
      estado_civil: normStr(r.estadocivil),
      cpf: normStr(r.cpf),
      rg: normStr(r.rgrne),
      pis: normStr(r.pis),
      cnh: normStr(r.cnh),
      data_validade_cnh: normDate(r.datavalidadecnh),
      categoria_cnh: normStr(r.categoriacnh),
      escolaridade: normStr(r.escolaridade),
      status: normStr(r.status),
      cep: normStr(r.cep),
      endereco: normStr(r.endereco),
      numero: normStr(r.numero),
      complemento: normStr(r.complemento),
      bairro: normStr(r.bairro),
      municipio: normStr(r.municipio),
      estado: normStr(r.estado),
      mei: normStr(r.mei),
      contrato: normStr(r.contrato),
      valor_hora: normNum(r.valorhora),
      salario_bruto: normNum(r.salariobruto),
      projeto: normStr(r.projeto),
      operadora: normStr(r.operadora),
      cargo_aso: normStr(r.cargoaso),
      telefone_vivo: normStr(r.telefonevivo),
      matricula_vivo: normStr(r.matriculavivo),
      status_vivo: normStr(r.statusvivo),
      observacao: normStr(r.observacao),
      // numero_contrato / validade_contrato / coordenador: sem equivalente
      // nesse endpoint do GPO — não entram no payload pra não sobrescrever
      // com null o que já estiver preenchido manualmente no Controle Eolen.
    };
  }).filter((p) => p.id !== null);

  for (const batch of chunk(payloads, 500)) {
    const { error } = await admin.from("pessoas").upsert(batch, { onConflict: "id" });
    if (error) { erros += batch.length; }
  }

  return { total: payloads.length, erros };
}

/* ---------------- Equipes / equipe_membros ---------------- */

async function syncEquipes(): Promise<SyncResumo["equipes"]> {
  const rows = await gpoFetch(`/grupos`);
  const admin = supabaseAdmin();

  const idsValidos = new Set(await fetchAllIds(admin, "pessoas"));

  type Grupo = {
    nome: string;
    regional: string | null;
    operadora: string | null;
    projeto: string | null;
    status: string | null;
    teamLiderId: number | null;
    teamLider: string | null;
    membros: { pessoaId: number; pessoaNome: string; cargo: string | null }[];
  };
  const grupos = new Map<string, Grupo>();
  let membrosOrfaos = 0;

  for (const r of rows) {
    const nome = normStr(r.nomegrupo);
    if (!nome) continue;
    if (!grupos.has(nome)) {
      grupos.set(nome, {
        nome, regional: null, operadora: null, projeto: null, status: null,
        teamLiderId: null, teamLider: null, membros: [],
      });
    }
    const g = grupos.get(nome)!;
    const funcao = normStr(r.funcao);
    if (funcao === "TEAM LIDER") {
      g.teamLiderId = normNum(r.idpessoa);
      g.teamLider = normStr(r.nomepessoa);
      g.regional = normStr(r.regional);
      g.operadora = normStr(r.operadora);
      g.projeto = normStr(r.projeto);
      g.status = r.status === 1 || r.status === "1" ? "ATIVO" : r.status === 0 || r.status === "0" ? "INATIVO" : normStr(r.status);
    } else if (g.regional === null) {
      // fallback: se ainda não vimos a linha do team lider, usa a primeira
      // linha disponível pra preencher os campos "de equipe" (todos os
      // membros de um grupo compartilham esses valores no GPO).
      g.regional = normStr(r.regional);
      g.operadora = normStr(r.operadora);
      g.projeto = normStr(r.projeto);
      g.status = r.status === 1 || r.status === "1" ? "ATIVO" : r.status === 0 || r.status === "0" ? "INATIVO" : normStr(r.status);
    }

    const pessoaId = normNum(r.idpessoa);
    if (pessoaId === null) continue;
    if (!idsValidos.has(pessoaId)) { membrosOrfaos++; continue; }
    g.membros.push({ pessoaId, pessoaNome: normStr(r.nomepessoa) || "", cargo: normStr(r.cargo) });
  }

  const gruposArr = Array.from(grupos.values()).sort((a, b) => a.nome.localeCompare(b.nome));

  // Reconstrução completa: apaga tudo e reinsere (não há id estável de
  // equipe vindo do GPO). Ordem: membros primeiro (FK), depois equipes.
  await admin.from("equipe_membros").delete().gte("id", 0);
  await admin.from("equipes").delete().gte("id", 0);

  const equipePayload = gruposArr.map((g) => ({
    nome: g.nome,
    regional: g.regional,
    operadora: g.operadora,
    projeto: g.projeto,
    status: g.status || "ATIVO",
    team_lider_id: g.teamLiderId && idsValidos.has(g.teamLiderId) ? g.teamLiderId : null,
    team_lider: g.teamLider,
  }));

  let totalMembros = 0;
  if (equipePayload.length) {
    const { data: inseridas, error } = await admin.from("equipes").insert(equipePayload).select("id, nome");
    if (error) throw new Error(`Falha ao inserir equipes: ${error.message}`);

    const idPorNome = new Map<string, number>();
    (inseridas || []).forEach((e: any) => idPorNome.set(e.nome, e.id));

    const membroPayload: any[] = [];
    for (const g of gruposArr) {
      const equipeId = idPorNome.get(g.nome);
      if (!equipeId) continue;
      for (const m of g.membros) {
        membroPayload.push({ equipe_id: equipeId, pessoa_id: m.pessoaId, pessoa_nome: m.pessoaNome, cargo: m.cargo });
      }
    }
    for (const batch of chunk(membroPayload, 1000)) {
      const { error: mErr } = await admin.from("equipe_membros").insert(batch);
      if (mErr) throw new Error(`Falha ao inserir membros de equipe: ${mErr.message}`);
    }
    totalMembros = membroPayload.length;
  }

  return { totalEquipes: equipePayload.length, totalMembros, membrosOrfaos };
}

/* ---------------- Treinamentos ---------------- */

async function syncTreinamentos(): Promise<SyncResumo["treinamentos"]> {
  const rows = await gpoFetch(`/pessoa/treinamentogeral?busca=&${GPO_QS}&deletado=0`);
  const admin = supabaseAdmin();

  const idsValidos = new Set(await fetchAllIds(admin, "pessoas"));

  const tiposDesconhecidos = new Set<string>();
  let orfaos = 0;

  type Row = {
    pessoa_id: number; pessoa_nome: string; tipo: string; categoria: "documento" | "treinamento";
    situacao_original: string | null; vencimento: string | null; data_emissao: string | null; legacyId: number;
  };
  const parsed: Row[] = [];

  for (const r of rows) {
    const tipo = normTipo(r.descricao);
    if (!tipo) { if (r.descricao) tiposDesconhecidos.add(String(r.descricao)); continue; }
    const pessoaId = normNum(r.idpessoa);
    if (pessoaId === null || !idsValidos.has(pessoaId)) { orfaos++; continue; }
    parsed.push({
      pessoa_id: pessoaId,
      pessoa_nome: normStr(r.nome) || "",
      tipo,
      categoria: TIPO_CATEGORIA[tipo],
      situacao_original: normStr(r.situacao),
      vencimento: normDate(r.datavencimento),
      data_emissao: normDate(r.dataemissao),
      legacyId: normNum(r.idtreinamento) || 0,
    });
  }

  // Dedup: mantém o mais recente por (pessoa_id, tipo).
  const groups = new Map<string, Row[]>();
  for (const row of parsed) {
    const key = `${row.pessoa_id}::${row.tipo}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  const final: Row[] = [];
  for (const items of groups.values()) {
    items.sort((a, b) => {
      const ea = a.data_emissao || ""; const eb = b.data_emissao || "";
      if (ea !== eb) return ea < eb ? 1 : -1;
      const va = a.vencimento || ""; const vb = b.vencimento || "";
      if (va !== vb) return va < vb ? 1 : -1;
      return b.legacyId - a.legacyId;
    });
    final.push(items[0]);
  }

  const payload = final.map((r) => ({
    pessoa_id: r.pessoa_id,
    pessoa_nome: r.pessoa_nome,
    tipo: r.tipo,
    categoria: r.categoria,
    situacao_original: r.situacao_original,
    vencimento: r.vencimento,
    data_emissao: r.data_emissao,
  }));

  // Reconstrução completa (mesma lógica validada na migração inicial).
  await admin.from("treinamentos").delete().gte("id", 0);
  for (const batch of chunk(payload, 1000)) {
    const { error } = await admin.from("treinamentos").insert(batch);
    if (error) throw new Error(`Falha ao inserir treinamentos: ${error.message}`);
  }

  return {
    totalOriginal: rows.length,
    totalFinal: payload.length,
    duplicadosRemovidos: parsed.length - final.length,
    tiposDesconhecidos: Array.from(tiposDesconhecidos),
    orfaos,
  };
}

/* ---------------- Orquestração ---------------- */

export async function syncFromGpo(): Promise<SyncResumo> {
  // Ordem importa: empresas antes de pessoas (FK), pessoas antes de
  // equipes/treinamentos (validação de pessoa_id existente).
  const empresas = await syncEmpresas();
  const pessoas = await syncPessoas();
  const equipes = await syncEquipes();
  const treinamentos = await syncTreinamentos();
  return { empresas, pessoas, equipes, treinamentos };
}
