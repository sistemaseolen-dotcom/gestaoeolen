import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";
import { encontrarDuplicidadePessoa } from "@/lib/pessoaDuplicidade";
import { CAMPOS_EMPRESA_EMBUTIDA, colunasEmpresaFromBody, nomeEmpresaEmbutida, propagarCamposEmpresa } from "@/lib/empresaEmbutida";

const CAMPOS_PESSOA = [
  "nome", "cargo", "cargo_aso", "status", "regional", "estado_atuacao", "projeto", "operadora", "cadastro", "coordenador",
  "tipo_pessoa", "data_admissao", "data_demissao", "matricula_esocial", "cpf", "rg",
  "data_nascimento", "pis", "cnh", "data_validade_cnh", "escolaridade", "estado_civil",
  "email", "telefone", "email_corporativo", "telefone_corporativo", "cep", "endereco",
  "numero", "complemento", "bairro", "municipio", "estado", "mei", "numero_contrato",
  "validade_contrato", "observacao", "valor_hora", "salario_bruto",
  // Credenciais de acesso ao sistema do cliente (pedido do Diego, 10/2026):
  // Ericsson usa Isignum, Huawei usa ISDP. Só o ID é armazenado — por
  // pedido do Diego (10/2026) o campo de senha foi removido.
  "isignum_id", "isdp_id",
  // Conta(s)/cliente(s) em que a pessoa está ativa (pedido do Diego,
  // 10/2026) -- array, pode ter mais de uma ao mesmo tempo.
  "contas",
  // Campos usados pela aba "Crescimento" (pedido do Diego, 15/10/2026) --
  // moram nesta mesma tabela `pessoas`, então também podem ser editados
  // por quem tem permissão em "pessoas" (ver /api/crescimento pra quem só
  // tem permissão em "crescimento").
  "responsavel", "nome_do_pai", "nome_da_mae", "numero_contato_emergencia",
  // Dados de empresa embutidos (pedido do Diego, 15/10/2026) -- ver
  // src/lib/empresaEmbutida.ts.
  ...CAMPOS_EMPRESA_EMBUTIDA,
] as const;

// Regional/coordenador são campos de preenchimento livre exibidos em várias
// telas (Pendências, Painel, etc.) — normalizados em maiúsculas aqui pra não
// depender de cada tela lembrar de fazer isso na exibição.
function upperOrSame(v: any): any {
  if (typeof v !== "string") return v;
  const s = v.trim();
  return s ? s.toUpperCase() : v;
}

// Mapeia o corpo da requisição (chaves iguais ao formulário da versão
// antiga) para as colunas snake_case da tabela `pessoas`.
function pessoaFromBody(body: any): Record<string, any> {
  return {
    nome: body?.nome,
    tipo_pessoa: body?.tipoPessoa,
    regional: upperOrSame(body?.regional),
    estado_atuacao: upperOrSame(body?.estadoAtuacao),
    cadastro: body?.cadastro,
    data_admissao: body?.dataAdmissao,
    data_demissao: body?.dataDemissao,
    matricula_esocial: body?.matriculaESocial,
    coordenador: upperOrSame(body?.coordenador),
    cargo: body?.cargo,
    cargo_aso: body?.cargoAso,
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
    isignum_id: body?.isignumId,
    isdp_id: body?.isdpId,
    contas: Array.isArray(body?.contas) ? body.contas : [],
    responsavel: body?.responsavel,
    nome_do_pai: body?.nomeDoPai,
    nome_da_mae: body?.nomeDaMae,
    numero_contato_emergencia: body?.numeroContatoEmergencia,
  };
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

export async function POST(req: Request) {
  const gate = await requirePermission("pessoas", "criar");
  if (gate.response) return gate.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const nome = (body?.nome || "").toString().trim().toUpperCase();
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

  const admin = supabaseAdmin();

  // Pedido do Diego (15/10/2026): não pode existir dois cadastros com o
  // mesmo CPF nem dois com o mesmo nome — regra que efetivamente bloqueia
  // o cadastro (a checagem ao vivo em POST /api/pessoas/verificar-
  // duplicidade só avisa cedo, mas é esta aqui que vale de verdade).
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

  // Empresa agora é sempre resolvida pelo CNPJ (pedido do Diego, 15/10/2026)
  // -- em branco significa "sem empresa vinculada" (CLT direto, por
  // exemplo). O nome de exibição (empresa_nome) é calculado só a partir dos
  // campos embutidos que vieram no body (já pré-preenchidos pela busca de
  // CNPJ no formulário, cache-first -- ver buscarDadosEmpresaEmbutida em
  // src/lib/empresaEmbutida.ts), sem depender mais da tabela `empresas`
  // (pedido do Diego, 16/10/2026: "nada depender mais da aba empresas").
  const empresaColunas = colunasEmpresaFromBody(body);
  const empresaCnpjDigits: string | null = empresaColunas.empresa_cnpj || null;
  if (empresaCnpjDigits && empresaCnpjDigits.length !== 14) {
    return NextResponse.json({ error: "Informe um CNPJ válido para a empresa (14 dígitos)." }, { status: 400 });
  }

  const payload = {
    ...pessoaFromBody(body),
    ...empresaColunas,
    nome,
    cpf,
    status,
    empresa_nome: empresaCnpjDigits ? nomeEmpresaEmbutida(empresaColunas) : null,
  };

  const { data: pessoa, error } = await admin.from("pessoas").insert(payload).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sincroniza os campos de empresa com quem mais tiver o mesmo CNPJ (ex.:
  // os outros funcionários da mesma empresa terceirizada) -- decisão do
  // Diego (15/10/2026): nunca deixar divergir.
  if (empresaCnpjDigits) {
    await propagarCamposEmpresa(admin, empresaCnpjDigits, pessoa.id, empresaColunas, gate.user);
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
