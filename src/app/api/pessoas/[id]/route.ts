import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields, auditDelete } from "@/lib/audit";
import { inativarPessoaCascata } from "@/lib/statusCascade";
import { encontrarDuplicidadePessoa, normalizarNomePessoa, soDigitosCpf } from "@/lib/pessoaDuplicidade";
import { buscarCnpj, CnpjLookupError, onlyDigitsCnpj } from "@/lib/cnpjLookup";
import { CAMPOS_EMPRESA_EMBUTIDA, colunasEmpresaFromBody, propagarCamposEmpresa } from "@/lib/empresaEmbutida";

const CAMPOS_PESSOA = [
  "nome", "cargo", "cargo_aso", "status", "regional", "estado_atuacao", "projeto", "operadora", "cadastro", "coordenador",
  "tipo_pessoa", "data_admissao", "data_demissao", "matricula_esocial", "cpf", "rg",
  "data_nascimento", "pis", "cnh", "data_validade_cnh", "escolaridade", "estado_civil",
  "email", "telefone", "email_corporativo", "telefone_corporativo", "cep", "endereco",
  "numero", "complemento", "bairro", "municipio", "estado", "mei", "numero_contrato",
  "validade_contrato", "observacao", "empresa_id", "valor_hora", "salario_bruto",
  // Credenciais de acesso ao sistema do cliente (pedido do Diego, 10/2026):
  // Ericsson usa Isignum, Huawei usa ISDP. Só o ID é armazenado — por
  // pedido do Diego (10/2026) o campo de senha foi removido.
  "isignum_id", "isdp_id",
  // Conta(s)/cliente(s) em que a pessoa está ativa (pedido do Diego,
  // 10/2026) -- array, pode ter mais de uma ao mesmo tempo.
  "contas",
  // Campos usados pela aba "Crescimento" (pedido do Diego, 15/10/2026).
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

// Mesmo mapeamento camelCase -> snake_case usado no POST de /api/pessoas,
// mas só inclui a coluna se a chave correspondente veio no body (PATCH
// parcial). empresaId é tratado à parte, pois também precisa re-resolver
// empresa_nome (ver PATCH abaixo).
function pessoaPatchFromBody(body: any): Record<string, any> {
  const map: Record<string, string> = {
    nome: "nome",
    tipoPessoa: "tipo_pessoa",
    regional: "regional",
    estadoAtuacao: "estado_atuacao",
    cadastro: "cadastro",
    dataAdmissao: "data_admissao",
    dataDemissao: "data_demissao",
    matriculaESocial: "matricula_esocial",
    coordenador: "coordenador",
    cargo: "cargo",
    cargoAso: "cargo_aso",
    email: "email",
    telefone: "telefone",
    emailCorporativo: "email_corporativo",
    telefoneCorporativo: "telefone_corporativo",
    dataNascimento: "data_nascimento",
    pis: "pis",
    cnh: "cnh",
    dataValidadeCNH: "data_validade_cnh",
    escolaridade: "escolaridade",
    estadoCivil: "estado_civil",
    cpf: "cpf",
    rg: "rg",
    status: "status",
    cep: "cep",
    endereco: "endereco",
    numero: "numero",
    complemento: "complemento",
    bairro: "bairro",
    municipio: "municipio",
    estado: "estado",
    mei: "mei",
    numeroContrato: "numero_contrato",
    validadeContrato: "validade_contrato",
    observacao: "observacao",
    valorHora: "valor_hora",
    salarioBruto: "salario_bruto",
    projeto: "projeto",
    operadora: "operadora",
    isignumId: "isignum_id",
    isdpId: "isdp_id",
    contas: "contas",
    // Campos usados pela aba "Crescimento" (pedido do Diego, 15/10/2026).
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

// Porta do empresaTitle() do app.js original.
function empresaTitle(e: { fantasia?: string | null; nome?: string | null; cnpj?: string | null }): string {
  return e?.fantasia || e?.nome || (e?.cnpj ? `CNPJ ${e.cnpj}` : "") || "Empresa sem nome";
}

// Mesma lógica de POST /api/pessoas (duplicada de propósito, ver comentário
// lá): acha a empresa pelo CNPJ ou cria uma nova buscando na Receita.
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

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("pessoas", "editar");
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

  // Pedido do Diego (15/10/2026): não pode existir dois cadastros com o
  // mesmo CPF nem dois com o mesmo nome. Só valida quando o CPF ou o nome
  // estão REALMENTE mudando (comparado ao valor já salvo) -- sem isso,
  // editar qualquer outro campo (telefone, cargo etc.) de um dos ~10 pares
  // de cadastros duplicados que já existiam no banco antes desta regra
  // ficaria bloqueado sem motivo, mesmo sem mexer no CPF/nome.
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

  // Empresa agora é sempre resolvida pelo CNPJ (pedido do Diego, 15/10/2026).
  // `empresaCnpj` só vem no body quando o formulário de Pessoa tem esse
  // campo (sempre tem, desde que a aba Empresas saiu do fluxo normal) --
  // em branco significa "sem empresa vinculada". Só bate no banco/Receita
  // de novo quando o CNPJ realmente mudou; se mudou só um campo manual
  // (PGR, PCMSO etc.) sem trocar o CNPJ, usa o valor que o cliente mandou
  // direto, sem re-resolver a empresa.
  const empresaColunas = colunasEmpresaFromBody(body);
  let empresaCnpjFinal: string | null = before.empresa_cnpj || null;
  if (Object.prototype.hasOwnProperty.call(empresaColunas, "empresa_cnpj")) {
    const cnpjNovo: string | null = empresaColunas.empresa_cnpj || null;
    const cnpjAntigo: string | null = before.empresa_cnpj || null;
    if (cnpjNovo !== cnpjAntigo) {
      if (!cnpjNovo) {
        // CNPJ removido -- desvincula a empresa por completo.
        patch.empresa_id = null;
        patch.empresa_nome = null;
        for (const campo of CAMPOS_EMPRESA_EMBUTIDA) patch[campo] = null;
        empresaCnpjFinal = null;
      } else {
        if (cnpjNovo.length !== 14) {
          return NextResponse.json({ error: "Informe um CNPJ válido para a empresa (14 dígitos)." }, { status: 400 });
        }
        try {
          const { empresa_id, empresa_nome } = await resolveOrCreateEmpresaPorCnpj(admin, cnpjNovo);
          patch.empresa_id = empresa_id;
          patch.empresa_nome = empresa_nome;
        } catch (err: any) {
          if (err instanceof CnpjLookupError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
          }
          return NextResponse.json(
            { error: err?.message || "Não foi possível localizar/criar a empresa pelo CNPJ." },
            { status: 500 }
          );
        }
        Object.assign(patch, empresaColunas);
        empresaCnpjFinal = cnpjNovo;
      }
    } else {
      // CNPJ não mudou -- só repassa os campos manuais que vieram (PGR,
      // PCMSO, contratos, tipo PJ, observação etc.), sem re-resolver nada.
      Object.assign(patch, empresaColunas);
    }
  }

  // atualizado_em é mantido por trigger no banco — não setamos aqui.
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
    campos: [...CAMPOS_PESSOA],
    usuario: gate.user,
  });

  // Sincroniza os campos de empresa com quem mais tiver o mesmo CNPJ --
  // decisão do Diego (15/10/2026): nunca deixar divergir. Função é
  // idempotente (só grava/audita onde realmente mudar algo) -- só chama
  // quando este PATCH de fato trouxe algum campo de empresa, pra não sair
  // lendo a lista de colegas em toda edição não relacionada (ex.: trocar
  // só o telefone de alguém numa empresa com 52 pessoas).
  if (empresaCnpjFinal && Object.keys(empresaColunas).length > 0) {
    await propagarCamposEmpresa(admin, empresaCnpjFinal, id, empresaColunas, gate.user);
  }

  // Inativar uma pessoa cascateia: desvincula ela de qualquer equipe. Ver
  // src/lib/statusCascade.ts. CORRIGIDO (16/10/2026, pedido do Diego,
  // exemplo da RSI): isso NÃO cascateia mais pra empresa nem pras outras
  // pessoas vinculadas ao mesmo CNPJ -- antes inativar 1 funcionário de
  // uma empresa prestadora de serviço (ex.: RSI, Alliance) inativava todo
  // mundo de lá junto, o que estava errado.
  if (patch.status === "INATIVO" && before.status !== "INATIVO") {
    await inativarPessoaCascata(id, gate.user);
  }

  return NextResponse.json(after);
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("pessoas", "excluir");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: pessoa, error: fetchError } = await admin.from("pessoas").select("*").eq("id", id).maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!pessoa) {
    return NextResponse.json({ error: "Pessoa não encontrada." }, { status: 404 });
  }

  // Limpeza de treinamentos (on delete cascade), membros de equipe (on
  // delete cascade) e team_lider_id (on delete set null) é feita pelo
  // próprio banco — não precisa replicar aqui.
  const { error: deleteError } = await admin.from("pessoas").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await auditDelete("pessoa", id, pessoa.nome, gate.user);

  return NextResponse.json({ ok: true });
}
