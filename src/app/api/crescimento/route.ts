import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";
import { encontrarDuplicidadePessoa } from "@/lib/pessoaDuplicidade";
import { buscarCnpj, CnpjLookupError, onlyDigitsCnpj } from "@/lib/cnpjLookup";
import { CAMPOS_EMPRESA_EMBUTIDA, buscarDadosEmpresaEmbutida, colunasEmpresaFromDados, propagarCamposEmpresa } from "@/lib/empresaEmbutida";

// Aba "Crescimento" (pedido do Diego, 15/10/2026): cadastro de pessoas
// entrando no processo de crescimento da empresa. Acesso restrito a quem o
// admin conceder permissão em "crescimento" (matriz de Usuários/
// Permissões) -- INDEPENDENTE de ter permissão em "pessoas". Ao salvar,
// cria um cadastro NOVO na mesma tabela `pessoas`, com status forçado
// "CRESCIMENTO" -- por isso esta rota reaproveita a checagem de
// duplicidade e a regra dos 11 documentos obrigatórios por cargo
// operacional, igual a POST /api/pessoas, mas com sua própria whitelist de
// campos (só os que aparecem no formulário de Crescimento) e sua própria
// permissão.

const CAMPOS_PESSOA_CRESCIMENTO = [
  "nome", "cargo", "status", "regional", "estado_atuacao", "projeto", "operadora", "coordenador",
  "tipo_pessoa", "data_admissao", "cpf", "rg", "data_nascimento", "email", "telefone", "cep",
  "endereco", "numero", "complemento", "bairro", "municipio", "estado", "mei", "empresa_id",
  "responsavel", "nome_do_pai", "nome_da_mae", "numero_contato_emergencia",
  ...CAMPOS_EMPRESA_EMBUTIDA,
] as const;

// Mesma lista de cargos operacionais / documentos obrigatórios de POST
// /api/pessoas (src/app/api/pessoas/route.ts) -- duplicada de propósito,
// mesmo padrão já usado neste projeto pra CAMPOS_PESSOA entre as duas rotas
// de pessoas (ver comentário lá).
const CARGOS_AUTO_DOCS = ["TEAM LIDER", "MEMBRO", "TÉCNICO", "VISTORIADOR", "CLEAN UP", "AUDITOR DE QUALIDADE"];
const AUTO_DOCS: Array<{ tipo: string; categoria: "treinamento" | "documento" }> = [
  { tipo: "NR35", categoria: "treinamento" },
  { tipo: "NR10", categoria: "treinamento" },
  { tipo: "ASO", categoria: "documento" },
  { tipo: "PGR", categoria: "documento" },
  { tipo: "PCMSO", categoria: "documento" },
  { tipo: "PRIMEIROS SOCORROS", categoria: "treinamento" },
  { tipo: "ORDEM DE SERVIÇO (NR01)", categoria: "documento" },
  { tipo: "CONTRATO", categoria: "documento" },
  { tipo: "NR06", categoria: "treinamento" },
  { tipo: "TERMO DE CONSENTIMENTO", categoria: "documento" },
  { tipo: "INTEGRAÇÃO DE SEGURANÇA", categoria: "treinamento" },
];

function upperOrSame(v: any): any {
  if (typeof v !== "string") return v;
  const s = v.trim();
  return s ? s.toUpperCase() : v;
}

function empresaTitle(e: { fantasia?: string | null; nome?: string | null; cnpj?: string | null }): string {
  return e?.fantasia || e?.nome || (e?.cnpj ? `CNPJ ${e.cnpj}` : "") || "Empresa sem nome";
}

// Acha a empresa pelo CNPJ (já cadastrada em "Empresas") ou cria uma nova,
// buscando os dados reais na Receita -- pedido do Diego (15/10/2026): "ao
// digitar o CNPJ ja deve buscar todas as informações pertinentes daquela
// empresa e não buscar da lista existente, pois como é crescimento, se
// refere a uma pessoa nova" (ou seja, a empresa pode ser nova também, não
// só a pessoa). Reaproveitada por POST aqui e por PATCH em [id]/route.ts
// (duplicada lá de propósito, mesmo padrão já usado neste projeto).
async function resolveOrCreateEmpresaPorCnpj(
  admin: ReturnType<typeof supabaseAdmin>,
  cnpjDigits: string
): Promise<{ empresa_id: number; empresa_nome: string }> {
  const { data: existente } = await admin
    .from("empresas")
    .select("id, nome, fantasia, cnpj")
    .eq("cnpj", cnpjDigits)
    .maybeSingle();
  if (existente) {
    return { empresa_id: existente.id, empresa_nome: empresaTitle(existente) };
  }

  const dados = await buscarCnpj(cnpjDigits);
  const { data: nova, error } = await admin
    .from("empresas")
    .insert({
      nome: dados.nome || `CNPJ ${cnpjDigits}`,
      fantasia: dados.fantasia || null,
      cnpj: cnpjDigits,
      porte: dados.porte || null,
      cidade: dados.cidade || null,
      uf: dados.uf || null,
      cep: dados.cep || null,
      bairro: dados.bairro || null,
      logradouro: dados.logradouro || null,
      numero: dados.numero || null,
      telefone: dados.telefone || null,
      email: dados.email || null,
      cnae_principal: dados.cnaePrincipal || null,
      cnae_descricao: dados.cnaeDescricao || null,
      situacao_cadastral: dados.situacaoCadastral || null,
      status: "ATIVO",
    })
    .select("id, nome, fantasia, cnpj")
    .single();
  if (error) throw error;
  return { empresa_id: nova.id, empresa_nome: empresaTitle(nova) };
}

// Campos obrigatórios do print que o Diego mandou (seção 1 a 4), com a
// mensagem exibida pro usuário se ficar em branco.
const CAMPOS_OBRIGATORIOS: Array<{ key: string; msg: string }> = [
  { key: "empresaCnpj", msg: "Informe o CNPJ da empresa." },
  { key: "responsavel", msg: "Informe o responsável." },
  { key: "tipoPessoa", msg: "Selecione o tipo de contratação." },
  { key: "nome", msg: "Informe o nome completo." },
  { key: "cargo", msg: "Informe a função/cargo." },
  { key: "rg", msg: "Informe o RG." },
  { key: "cpf", msg: "Informe o CPF." },
  { key: "nomeDoPai", msg: "Informe o nome do pai." },
  { key: "nomeDaMae", msg: "Informe o nome da mãe." },
  { key: "dataNascimento", msg: "Informe a data de nascimento." },
  { key: "dataAdmissao", msg: "Informe a admissão." },
  { key: "email", msg: "Informe o e-mail." },
  { key: "telefone", msg: "Informe o telefone." },
  { key: "estadoAtuacao", msg: "Informe o estado de atuação." },
  { key: "regional", msg: "Informe a regional." },
  { key: "projeto", msg: "Informe o projeto." },
  { key: "operadora", msg: "Informe a operadora." },
  { key: "coordenador", msg: "Informe o coordenador." },
  { key: "endereco", msg: "Informe o endereço." },
  { key: "numero", msg: "Informe o número de contato." },
  { key: "numeroContatoEmergencia", msg: "Informe o número de contato de emergência." },
  { key: "municipio", msg: "Informe a cidade." },
  { key: "bairro", msg: "Informe o bairro." },
  { key: "cep", msg: "Informe o CEP." },
  { key: "estado", msg: "Informe a UF." },
];

export async function POST(req: Request) {
  const gate = await requirePermission("crescimento", "criar");
  if (gate.response) return gate.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  for (const campo of CAMPOS_OBRIGATORIOS) {
    const v = body?.[campo.key];
    if (v === null || v === undefined || (typeof v === "string" && !v.trim())) {
      return NextResponse.json({ error: campo.msg }, { status: 400 });
    }
  }

  const empresaCnpjDigits = onlyDigitsCnpj(body.empresaCnpj || "");
  if (empresaCnpjDigits.length !== 14) {
    return NextResponse.json({ error: "Informe um CNPJ válido para a empresa (14 dígitos)." }, { status: 400 });
  }

  const nome = (body.nome || "").toString().trim().toUpperCase();
  const cpf = (body.cpf || "").toString().trim();

  const admin = supabaseAdmin();

  // Mesma regra de duplicidade de POST /api/pessoas -- não pode existir
  // dois cadastros com o mesmo CPF nem dois com o mesmo nome.
  const duplicidade = await encontrarDuplicidadePessoa(admin, { cpf, nome });
  if (duplicidade.cpfDuplicado) {
    return NextResponse.json(
      { error: `Já existe um cadastro com esse CPF: ${duplicidade.cpfDuplicado.nome} (ID ${duplicidade.cpfDuplicado.id}).` },
      { status: 409 }
    );
  }
  if (duplicidade.nomeDuplicado) {
    return NextResponse.json(
      { error: `Já existe uma pessoa cadastrada com esse nome: ${duplicidade.nomeDuplicado.nome} (ID ${duplicidade.nomeDuplicado.id}).` },
      { status: 409 }
    );
  }

  let empresaResolved: { empresa_id: number; empresa_nome: string };
  let empresaColunas: Record<string, any>;
  try {
    empresaResolved = await resolveOrCreateEmpresaPorCnpj(admin, empresaCnpjDigits);
    // Resolve os campos empresa_* embutidos inteiramente no servidor
    // (cache-first) -- o formulário de Crescimento não tem campos manuais
    // de empresa (PGR/PCMSO etc.) visíveis, então herda tudo de quem já
    // estiver cadastrado com o mesmo CNPJ (ver src/lib/empresaEmbutida.ts).
    empresaColunas = colunasEmpresaFromDados(await buscarDadosEmpresaEmbutida(empresaCnpjDigits));
  } catch (err: any) {
    if (err instanceof CnpjLookupError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message || "Não foi possível localizar/criar a empresa pelo CNPJ." },
      { status: 500 }
    );
  }
  const { empresa_id, empresa_nome } = empresaResolved;

  const payload = {
    nome,
    cpf,
    status: "CRESCIMENTO", // forçado -- é assim que a pessoa aparece em "Pessoas" (pedido do Diego, 15/10/2026)
    cargo: body.cargo,
    regional: upperOrSame(body.regional),
    estado_atuacao: upperOrSame(body.estadoAtuacao),
    projeto: body.projeto,
    operadora: body.operadora,
    coordenador: upperOrSame(body.coordenador),
    tipo_pessoa: body.tipoPessoa,
    data_admissao: body.dataAdmissao,
    rg: body.rg,
    data_nascimento: body.dataNascimento,
    email: body.email,
    telefone: body.telefone,
    cep: body.cep,
    endereco: body.endereco,
    numero: body.numero,
    complemento: body.complemento || null,
    bairro: body.bairro,
    municipio: body.municipio,
    estado: body.estado,
    // CNPJ/MEI deste formulário é da EMPRESA (resolvido acima por
    // resolveOrCreateEmpresaPorCnpj), não é mais o MEI pessoal do
    // profissional -- esse campo some deste formulário (pedido do Diego,
    // 15/10/2026). Fica com a mesma regra automática usada em /api/pessoas
    // (ajustarMeiConformeTipo no client): "N/A" quando não é PJ; quando é
    // PJ, fica em branco pra ser preenchido depois, editando a pessoa em
    // "Pessoas".
    mei: /^PJ/i.test((body.tipoPessoa || "").toString().trim()) ? null : "N/A",
    empresa_id,
    empresa_nome,
    ...empresaColunas,
    responsavel: body.responsavel,
    nome_do_pai: body.nomeDoPai,
    nome_da_mae: body.nomeDaMae,
    numero_contato_emergencia: body.numeroContatoEmergencia,
  };

  const { data: pessoa, error } = await admin.from("pessoas").insert(payload).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mesma regra de POST /api/pessoas: cargo operacional ganha os 11
  // documentos obrigatórios como pendentes.
  const cargoNormalizado = (pessoa.cargo || "").toString().trim().toUpperCase();
  if (CARGOS_AUTO_DOCS.includes(cargoNormalizado)) {
    const rows = AUTO_DOCS.map((doc) => ({
      pessoa_id: pessoa.id,
      pessoa_nome: pessoa.nome,
      tipo: doc.tipo,
      categoria: doc.categoria,
      vencimento: null,
      data_emissao: null,
      situacao_original: "",
      arquivo_path: null,
      arquivo_nome: null,
      observacao: null,
    }));
    const { error: docsError } = await admin.from("treinamentos").insert(rows);
    if (docsError) {
      return NextResponse.json({ error: docsError.message }, { status: 500 });
    }
  }

  await auditDiffFields({
    entidade: "pessoa",
    entidadeId: pessoa.id,
    entidadeLabel: pessoa.nome,
    before: null,
    after: pessoa,
    campos: [...CAMPOS_PESSOA_CRESCIMENTO],
    usuario: gate.user,
  });

  // Sincroniza os campos de empresa com quem mais tiver o mesmo CNPJ --
  // decisão do Diego (15/10/2026): nunca deixar divergir.
  await propagarCamposEmpresa(admin, empresaCnpjDigits, pessoa.id, empresaColunas, gate.user);

  return NextResponse.json(pessoa, { status: 201 });
}
