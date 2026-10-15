import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";
import { encontrarDuplicidadePessoa } from "@/lib/pessoaDuplicidade";

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

async function resolveEmpresaNome(empresaId: number | null): Promise<{ empresa_id: number | null; empresa_nome: string | null }> {
  if (empresaId === null || empresaId === undefined || Number.isNaN(empresaId)) {
    return { empresa_id: null, empresa_nome: null };
  }
  const { data } = await supabaseAdmin()
    .from("empresas")
    .select("nome, fantasia, cnpj")
    .eq("id", empresaId)
    .maybeSingle();
  if (!data) return { empresa_id: null, empresa_nome: null };
  return { empresa_id: empresaId, empresa_nome: empresaTitle(data) };
}

// Campos obrigatórios do print que o Diego mandou (seção 1 a 4), com a
// mensagem exibida pro usuário se ficar em branco.
const CAMPOS_OBRIGATORIOS: Array<{ key: string; msg: string }> = [
  { key: "empresaId", msg: "Selecione a empresa." },
  { key: "mei", msg: "Informe o CNPJ/MEI." },
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

  const empresaId = Number(body.empresaId);
  const { empresa_id, empresa_nome } = await resolveEmpresaNome(empresaId);

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
    mei: body.mei,
    empresa_id,
    empresa_nome,
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

  return NextResponse.json(pessoa, { status: 201 });
}
