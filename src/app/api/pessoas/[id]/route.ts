import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields, auditDelete } from "@/lib/audit";

const CAMPOS_PESSOA = [
  "nome", "cargo", "status", "regional", "projeto", "operadora", "cadastro", "coordenador",
  "tipo_pessoa", "data_admissao", "data_demissao", "matricula_esocial", "cpf", "rg",
  "data_nascimento", "pis", "cnh", "data_validade_cnh", "escolaridade", "estado_civil",
  "email", "telefone", "email_corporativo", "telefone_corporativo", "cep", "endereco",
  "numero", "complemento", "bairro", "municipio", "estado", "mei", "numero_contrato",
  "validade_contrato", "observacao", "empresa_id", "valor_hora", "salario_bruto",
] as const;

// Mesmo mapeamento camelCase -> snake_case usado no POST de /api/pessoas,
// mas só inclui a coluna se a chave correspondente veio no body (PATCH
// parcial). empresaId é tratado à parte, pois também precisa re-resolver
// empresa_nome (ver PATCH abaixo).
function pessoaPatchFromBody(body: any): Record<string, any> {
  const map: Record<string, string> = {
    nome: "nome",
    tipoPessoa: "tipo_pessoa",
    regional: "regional",
    cadastro: "cadastro",
    dataAdmissao: "data_admissao",
    dataDemissao: "data_demissao",
    matriculaESocial: "matricula_esocial",
    coordenador: "coordenador",
    cargo: "cargo",
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
  };
  const out: Record<string, any> = {};
  for (const [bodyKey, column] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(body || {}, bodyKey)) {
      out[column] = body[bodyKey];
    }
  }
  return out;
}

// Porta do empresaTitle() do app.js original.
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

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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
      patch[campo] = valor;
    }
  }

  // empresaId muda tanto empresa_id quanto o cache empresa_nome — re-resolve
  // os dois juntos, igual ao create.
  if (Object.prototype.hasOwnProperty.call(body || {}, "empresaId")) {
    const empresaIdRaw = body.empresaId;
    const empresaId = empresaIdRaw === null || empresaIdRaw === undefined || empresaIdRaw === "" ? null : Number(empresaIdRaw);
    const { empresa_id, empresa_nome } = await resolveEmpresaNome(empresaId);
    patch.empresa_id = empresa_id;
    patch.empresa_nome = empresa_nome;
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

  return NextResponse.json(after);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
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
