import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";
import { encontrarDuplicidadePessoa } from "@/lib/pessoaDuplicidade";
import { CnpjLookupError, onlyDigitsCnpj } from "@/lib/cnpjLookup";
import { CAMPOS_EMPRESA_EMBUTIDA, buscarDadosEmpresaEmbutida, colunasEmpresaFromDados, nomeEmpresaEmbutida, propagarCamposEmpresa } from "@/lib/empresaEmbutida";
import { enviarEmailSolicitacaoCrescimento } from "@/lib/crescimentoAprovacao";

// Aba "Crescimento" (pedido do Diego, 15/10/2026): cadastro de pessoas
// entrando no processo de crescimento da empresa. Acesso restrito a quem o
// admin conceder permissão em "crescimento" (matriz de Usuários/
// Permissões) -- INDEPENDENTE de ter permissão em "pessoas". Ao salvar,
// cria um cadastro NOVO na mesma tabela `pessoas`, com status forçado
// "CRESCIMENTO" -- por isso esta rota reaproveita a checagem de
// duplicidade de POST /api/pessoas (os documentos obrigatórios só entram
// depois da aprovação -- ver mais abaixo), mas com sua própria whitelist de
// campos (só os que aparecem no formulário de Crescimento) e sua própria
// permissão.

const CAMPOS_PESSOA_CRESCIMENTO = [
  "nome", "cargo", "status", "regional", "estado_atuacao", "projeto", "operadora", "coordenador",
  "tipo_pessoa", "data_admissao", "cpf", "rg", "data_nascimento", "email", "telefone", "cep",
  "endereco", "numero", "complemento", "bairro", "municipio", "estado", "mei",
  "responsavel", "nome_do_pai", "nome_da_mae", "numero_contato_emergencia",
  // Quem solicitou (pedido do Diego, 16/10/2026) -- ver comentário no payload abaixo.
  "solicitante_crescimento_nome",
  ...CAMPOS_EMPRESA_EMBUTIDA,
] as const;

// Documentos obrigatórios: desde 16/10/2026 (pedido do Diego) NÃO são mais
// criados aqui na solicitação -- só quando o aprovador aprovar o
// crescimento (ver POST /api/crescimento/[id]/aprovacao e
// DOCS_OBRIGATORIOS_CRESCIMENTO em src/lib/crescimentoAprovacao.ts): "antes
// de iniciar toda a tratativa das documentações esse crescimento que foi
// solicitado deve passar por uma aprovação".

function upperOrSame(v: any): any {
  if (typeof v !== "string") return v;
  const s = v.trim();
  return s ? s.toUpperCase() : v;
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

  // Resolve os campos empresa_* embutidos inteiramente no servidor
  // (cache-first: pessoas -> `empresas` (legado, só leitura) -> Receita) --
  // ver buscarDadosEmpresaEmbutida em src/lib/empresaEmbutida.ts. Desde que
  // a aba Empresas foi removida (16/10/2026, pedido do Diego), não existe
  // mais resolveOrCreateEmpresaPorCnpj aqui -- só esta única consulta, sem
  // gravar nada em `empresas`.
  let empresaColunas: Record<string, any>;
  try {
    empresaColunas = colunasEmpresaFromDados(await buscarDadosEmpresaEmbutida(empresaCnpjDigits));
  } catch (err: any) {
    if (err instanceof CnpjLookupError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message || "Não foi possível localizar os dados da empresa pelo CNPJ." },
      { status: 500 }
    );
  }
  const empresa_nome = nomeEmpresaEmbutida(empresaColunas);

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
    // Pedido do Diego (16/10/2026): "essa data de contratação... só vai ser
    // preenchida quando passar essa pessoa para ativo" -- nunca no
    // cadastro em Crescimento (removida do formulário e do CAMPOS_
    // OBRIGATORIOS acima). Quem controla o preenchimento automático é o
    // PATCH /api/crescimento/[id] (e /api/pessoas/[id]), no momento em que
    // o status muda pra ATIVO.
    data_admissao: null,
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
    // buscarDadosEmpresaEmbutida), não é mais o MEI pessoal do
    // profissional -- esse campo some deste formulário (pedido do Diego,
    // 15/10/2026). Fica com a mesma regra automática usada em /api/pessoas
    // (ajustarMeiConformeTipo no client): "N/A" quando não é PJ; quando é
    // PJ, fica em branco pra ser preenchido depois, editando a pessoa em
    // "Pessoas".
    mei: /^PJ/i.test((body.tipoPessoa || "").toString().trim()) ? null : "N/A",
    empresa_nome,
    ...empresaColunas,
    responsavel: body.responsavel,
    nome_do_pai: body.nomeDoPai,
    nome_da_mae: body.nomeDaMae,
    numero_contato_emergencia: body.numeroContatoEmergencia,
    // Quem (usuário logado) está solicitando este crescimento -- pedido do
    // Diego (16/10/2026), preenchido automaticamente, não vem do body.
    solicitante_crescimento_id: gate.user?.id ?? null,
    solicitante_crescimento_nome: gate.user?.nome ?? null,
    // Fluxo de aprovação (pedido do Diego, 16/10/2026) -- todo pedido novo
    // nasce aguardando o aprovador definido em Administrador.
    crescimento_aprovacao_status: "AGUARDANDO",
  };

  const { data: pessoa, error } = await admin.from("pessoas").insert(payload).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  // Avisa o aprovador por e-mail (best-effort: se falhar ou não houver
  // aprovador definido, o pedido continua registrado e aguardando -- só
  // devolve um aviso pra tela mostrar).
  const email = await enviarEmailSolicitacaoCrescimento({ admin, pessoa, origin: new URL(req.url).origin });

  return NextResponse.json({ ...pessoa, aviso: email.aviso }, { status: 201 });
}
