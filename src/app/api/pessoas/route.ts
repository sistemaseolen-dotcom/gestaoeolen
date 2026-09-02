import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";

const CAMPOS_PESSOA = [
  "nome", "cargo", "status", "regional", "projeto", "operadora", "cadastro", "coordenador",
  "tipo_pessoa", "data_admissao", "data_demissao", "matricula_esocial", "cpf", "rg",
  "data_nascimento", "pis", "cnh", "data_validade_cnh", "escolaridade", "estado_civil",
  "email", "telefone", "email_corporativo", "telefone_corporativo", "cep", "endereco",
  "numero", "complemento", "bairro", "municipio", "estado", "mei", "numero_contrato",
  "validade_contrato", "observacao", "empresa_id", "valor_hora", "salario_bruto",
] as const;

// Mapeia o corpo da requisição (chaves iguais ao formulário da versão
// antiga) para as colunas snake_case da tabela `pessoas`.
function pessoaFromBody(body: any): Record<string, any> {
  return {
    nome: body?.nome,
    tipo_pessoa: body?.tipoPessoa,
    regional: body?.regional,
    cadastro: body?.cadastro,
    data_admissao: body?.dataAdmissao,
    data_demissao: body?.dataDemissao,
    matricula_esocial: body?.matriculaESocial,
    coordenador: body?.coordenador,
    empresa_id: body?.empresaId,
    cargo: body?.cargo,
    email: body?.email,
    telefone: body?.telefone,
    email_corporativo: body?.emailCorporativo,
    telefone_corporativo: body?.telefoneCorporativo,
    data_nascimento: body?.dataNascimento,
    pis: body?.pis,
    cnh: body?.cnh,
    data_validade_cnh: body?.dataValidadeCNH,
    escolaridade: body?.escolaridade,
    estado_civil: body?.estadoCivil,
    cpf: body?.cpf,
    rg: body?.rg,
    status: body?.status,
    cep: body?.cep,
    endereco: body?.endereco,
    numero: body?.numero,
    complemento: body?.complemento,
    bairro: body?.bairro,
    municipio: body?.municipio,
    estado: body?.estado,
    mei: body?.mei,
    numero_contrato: body?.numeroContrato,
    validade_contrato: body?.validadeContrato,
    observacao: body?.observacao,
    valor_hora: body?.valorHora,
    salario_bruto: body?.salarioBruto,
    projeto: body?.projeto,
    operadora: body?.operadora,
  };
}

// Porta do empresaTitle() do app.js original.
function empresaTitle(e: { fantasia?: string | null; nome?: string | null; cnpj?: string | null }): string {
  return e?.fantasia || e?.nome || (e?.cnpj ? `CNPJ ${e.cnpj}` : "") || "Empresa sem nome";
}

// Cargos operacionais que disparam a criação automática dos 11
// treinamentos/documentos pendentes ao cadastrar a pessoa — porta 1:1 da
// regra do app.js antigo.
const CARGOS_AUTO_DOCS = [
  "TEAM LIDER",
  "MEMBRO",
  "TÉCNICO",
  "VISTORIADOR",
  "CLEAN UP",
  "AUDITOR DE QUALIDADE",
];

// tipo/categoria dos 11 treinamentos/documentos pendentes gerados
// automaticamente para os cargos operacionais acima.
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

// Resolve empresa_nome a partir de empresa_id — usado tanto no create quanto
// no update. Se o id não for informado ou a empresa não existir, retorna
// ambos nulos em vez de falhar a requisição inteira.
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

export async function POST(req: Request) {
  const gate = await requirePermission("pessoas", "criar");
  if (gate.response) return gate.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const nome = (body?.nome || "").toString().trim();
  const cpf = (body?.cpf || "").toString().trim();
  const status = (body?.status || "").toString().trim();
  if (!nome) {
    return NextResponse.json({ error: "Informe o nome da pessoa." }, { status: 400 });
  }
  if (!cpf) {
    return NextResponse.json({ error: "Informe o CPF da pessoa." }, { status: 400 });
  }
  if (!status) {
    return NextResponse.json({ error: "Informe o status da pessoa." }, { status: 400 });
  }

  const empresaIdRaw = body?.empresaId;
  const empresaId = empresaIdRaw === null || empresaIdRaw === undefined || empresaIdRaw === "" ? null : Number(empresaIdRaw);
  const { empresa_id, empresa_nome } = await resolveEmpresaNome(empresaId);

  const payload = {
    ...pessoaFromBody(body),
    nome,
    cpf,
    status,
    empresa_id,
    empresa_nome,
  };

  const admin = supabaseAdmin();
  const { data: pessoa, error } = await admin.from("pessoas").insert(payload).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Cargos operacionais ganham automaticamente os 11 treinamentos/documentos
  // pendentes — mesma regra do app.js antigo, agora feita num bulk insert.
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
    campos: [...CAMPOS_PESSOA],
    usuario: gate.user,
  });

  return NextResponse.json(pessoa, { status: 201 });
}
