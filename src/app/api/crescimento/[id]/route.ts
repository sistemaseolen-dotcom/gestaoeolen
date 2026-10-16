import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";
import { inativarPessoaCascata } from "@/lib/statusCascade";
import { encontrarDuplicidadePessoa, normalizarNomePessoa, soDigitosCpf } from "@/lib/pessoaDuplicidade";
import { CnpjLookupError, onlyDigitsCnpj } from "@/lib/cnpjLookup";
import { CAMPOS_EMPRESA_EMBUTIDA, buscarDadosEmpresaEmbutida, colunasEmpresaFromDados, nomeEmpresaEmbutida, propagarCamposEmpresa } from "@/lib/empresaEmbutida";

// Edição de um cadastro em Crescimento -- gateado por "crescimento":"editar",
// INDEPENDENTE de "pessoas" (ver POST /api/crescimento pro resto do
// contexto). O caso de uso mais importante aqui é encerrar o processo: o
// Diego confirmou (15/10/2026) que "o processo de Crescimento só termina
// quando uma pessoa muda o status dela para ativo, inativo ou bloqueado" --
// por isso `status` é editável por aqui, mesmo pra quem não tem permissão
// nenhuma em "pessoas".

const CAMPOS_PESSOA_CRESCIMENTO = [
  "nome", "cargo", "status", "regional", "estado_atuacao", "projeto", "operadora", "coordenador",
  "tipo_pessoa", "data_admissao", "cpf", "rg", "data_nascimento", "email", "telefone", "cep",
  "endereco", "numero", "complemento", "bairro", "municipio", "estado", "mei",
  "responsavel", "nome_do_pai", "nome_da_mae", "numero_contato_emergencia",
  ...CAMPOS_EMPRESA_EMBUTIDA,
] as const;

function upperOrSame(v: any): any {
  if (typeof v !== "string") return v;
  const s = v.trim();
  return s ? s.toUpperCase() : v;
}

function pessoaPatchFromBody(body: any): Record<string, any> {
  const map: Record<string, string> = {
    nome: "nome",
    cargo: "cargo",
    status: "status",
    regional: "regional",
    estadoAtuacao: "estado_atuacao",
    projeto: "projeto",
    operadora: "operadora",
    coordenador: "coordenador",
    tipoPessoa: "tipo_pessoa",
    dataAdmissao: "data_admissao",
    cpf: "cpf",
    rg: "rg",
    dataNascimento: "data_nascimento",
    email: "email",
    telefone: "telefone",
    cep: "cep",
    endereco: "endereco",
    numero: "numero",
    complemento: "complemento",
    bairro: "bairro",
    municipio: "municipio",
    estado: "estado",
    responsavel: "responsavel",
    nomeDoPai: "nome_do_pai",
    nomeDaMae: "nome_da_mae",
    numeroContatoEmergencia: "numero_contato_emergencia",
  };
  const out: Record<string, any> = {};
  for (const [bodyKey, column] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(body || {}, bodyKey)) {
      out[column] = bodyKey === "regional" || bodyKey === "coordenador" || bodyKey === "estadoAtuacao" ? upperOrSame(body[bodyKey]) : body[bodyKey];
    }
  }
  return out;
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("crescimento", "editar");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: before, error: fetchError } = await admin.from("pessoas").select("*").eq("id", id).maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: "Pessoa não encontrada." }, { status: 404 });
  }

  const patch = pessoaPatchFromBody(body);

  for (const campo of ["nome", "cpf", "status"] as const) {
    if (Object.prototype.hasOwnProperty.call(patch, campo)) {
      const valor = (patch[campo] || "").toString().trim();
      if (!valor) {
        return NextResponse.json({ error: `O campo obrigatório "${campo}" não pode ficar em branco.` }, { status: 400 });
      }
      patch[campo] = campo === "nome" ? valor.toUpperCase() : valor;
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "cpf") && soDigitosCpf(patch.cpf) !== soDigitosCpf(before.cpf)) {
    const duplicidade = await encontrarDuplicidadePessoa(admin, { cpf: patch.cpf, excluirId: id });
    if (duplicidade.cpfDuplicado) {
      return NextResponse.json(
        { error: `Já existe um cadastro com esse CPF: ${duplicidade.cpfDuplicado.nome} (ID ${duplicidade.cpfDuplicado.id}).` },
        { status: 409 }
      );
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "nome") && normalizarNomePessoa(patch.nome) !== normalizarNomePessoa(before.nome)) {
    const duplicidade = await encontrarDuplicidadePessoa(admin, { nome: patch.nome, excluirId: id });
    if (duplicidade.nomeDuplicado) {
      return NextResponse.json(
        { error: `Já existe uma pessoa cadastrada com esse nome: ${duplicidade.nomeDuplicado.nome} (ID ${duplicidade.nomeDuplicado.id}).` },
        { status: 409 }
      );
    }
  }

  // `empresaCnpj` só vem no body quando o usuário digitou um CNPJ novo no
  // formulário -- em branco (ou ausente) significa "manter a empresa
  // atual" (pedido do Diego, 15/10/2026).
  let empresaCnpjFinal: string | null = before.empresa_cnpj || null;
  let empresaColunas: Record<string, any> = {};
  if (Object.prototype.hasOwnProperty.call(body || {}, "empresaCnpj")) {
    const empresaCnpjDigits = onlyDigitsCnpj(body.empresaCnpj || "");
    if (empresaCnpjDigits) {
      if (empresaCnpjDigits.length !== 14) {
        return NextResponse.json({ error: "Informe um CNPJ válido para a empresa (14 dígitos)." }, { status: 400 });
      }
      try {
        // Mesmo raciocínio de POST /api/crescimento (desde 16/10/2026, sem
        // mais resolveOrCreateEmpresaPorCnpj): resolve os campos empresa_*
        // embutidos inteiramente no servidor (cache-first), já que este
        // formulário não tem campos manuais de empresa visíveis -- ver
        // buscarDadosEmpresaEmbutida em src/lib/empresaEmbutida.ts.
        empresaColunas = colunasEmpresaFromDados(await buscarDadosEmpresaEmbutida(empresaCnpjDigits));
        Object.assign(patch, empresaColunas);
        patch.empresa_nome = nomeEmpresaEmbutida(empresaColunas);
        empresaCnpjFinal = empresaCnpjDigits;
      } catch (err: any) {
        if (err instanceof CnpjLookupError) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        return NextResponse.json(
          { error: err?.message || "Não foi possível localizar os dados da empresa pelo CNPJ." },
          { status: 500 }
        );
      }
    }
  }

  // Pedido do Diego (16/10/2026): "essa data de contratação... só vai ser
  // preenchida quando passar essa pessoa para ativo" -- nunca manualmente
  // durante o processo de Crescimento (por isso saiu do formulário de
  // criação/edição). Preenche sozinha com a data de hoje no exato momento
  // em que o status muda pra ATIVO, só se ainda não tiver uma data (não
  // sobrescreve se alguém já corrigiu à mão).
  if (patch.status === "ATIVO" && before.status !== "ATIVO" && !before.data_admissao && !patch.data_admissao) {
    patch.data_admissao = new Date().toISOString().slice(0, 10);
  }

  const { data: after, error: updateError } = await admin
    .from("pessoas")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await auditDiffFields({
    entidade: "pessoa",
    entidadeId: id,
    entidadeLabel: after.nome,
    before,
    after,
    campos: [...CAMPOS_PESSOA_CRESCIMENTO],
    usuario: gate.user,
  });

  // Sincroniza os campos de empresa com quem mais tiver o mesmo CNPJ --
  // decisão do Diego (15/10/2026): nunca deixar divergir.
  if (empresaCnpjFinal && Object.keys(empresaColunas).length > 0) {
    await propagarCamposEmpresa(admin, empresaCnpjFinal, id, empresaColunas, gate.user);
  }

  // Mesma regra de cascata de PATCH /api/pessoas/[id]: inativar desvincula
  // de equipes, mas NÃO cascateia pra empresa/outras pessoas (corrigido em
  // 16/10/2026 -- ver src/lib/statusCascade.ts).
  if (patch.status === "INATIVO" && before.status !== "INATIVO") {
    await inativarPessoaCascata(id, gate.user);
  }

  return NextResponse.json(after);
}
