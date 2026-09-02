import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields, auditDelete } from "@/lib/audit";

const CAMPOS_EMPRESA = [
  "nome", "fantasia", "cnpj", "porte", "cidade", "uf", "cep", "bairro", "logradouro",
  "numero", "telefone", "email", "nome_responsavel", "regional", "cnae_principal",
  "cnae_descricao", "pgr", "pcmso", "situacao_cadastral", "status", "contratos",
  "tipo_pj", "observacao",
] as const;

// Mesmo mapeamento camelCase -> snake_case usado no POST de /api/empresas,
// mas só inclui a chave se ela veio no body (PATCH parcial).
function empresaPatchFromBody(body: any): Record<string, any> {
  const map: Record<string, string> = {
    nome: "nome",
    fantasia: "fantasia",
    cnpj: "cnpj",
    porte: "porte",
    cidade: "cidade",
    uf: "uf",
    cep: "cep",
    bairro: "bairro",
    logradouro: "logradouro",
    numero: "numero",
    telefone: "telefone",
    email: "email",
    nomeResponsavel: "nome_responsavel",
    regional: "regional",
    cnaePrincipal: "cnae_principal",
    cnaeDescricao: "cnae_descricao",
    pgr: "pgr",
    pcmso: "pcmso",
    situacaoCadastral: "situacao_cadastral",
    status: "status",
    contratos: "contratos",
    tipoPJ: "tipo_pj",
    observacao: "observacao",
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

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("empresas", "editar");
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

  const { data: before, error: fetchError } = await admin.from("empresas").select("*").eq("id", id).maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const patch = empresaPatchFromBody(body);
  if (Object.prototype.hasOwnProperty.call(patch, "nome")) {
    const nome = (patch.nome || "").toString().trim();
    if (!nome) {
      return NextResponse.json({ error: "Informe a razão social da empresa." }, { status: 400 });
    }
    patch.nome = nome;
  }

  // atualizado_em é mantido por trigger no banco — não setamos aqui.
  const { data: after, error: updateError } = await admin
    .from("empresas")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Sincroniza o cache empresa_nome em `pessoas` — espelha o comportamento
  // do app.js antigo, que recomputava o nome exibido sempre que a razão
  // social ou o nome fantasia da empresa mudava.
  if (before.nome !== after.nome || before.fantasia !== after.fantasia) {
    const novoNomeCache = empresaTitle(after);
    const { error: syncError } = await admin
      .from("pessoas")
      .update({ empresa_nome: novoNomeCache })
      .eq("empresa_id", id);
    if (syncError) {
      return NextResponse.json({ error: syncError.message }, { status: 500 });
    }
  }

  await auditDiffFields({
    entidade: "empresa",
    entidadeId: id,
    entidadeLabel: empresaTitle(after),
    before,
    after,
    campos: [...CAMPOS_EMPRESA],
    usuario: gate.user,
  });

  return NextResponse.json(after);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("empresas", "excluir");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: empresa, error: fetchError } = await admin.from("empresas").select("*").eq("id", id).maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!empresa) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  // Correção deliberada em relação ao app.js antigo: lá só empresa_id era
  // zerado, deixando empresa_nome com um valor "fantasma". Aqui limpamos os
  // dois para não deixar cache desatualizado nas pessoas vinculadas.
  const { error: unlinkError } = await admin
    .from("pessoas")
    .update({ empresa_id: null, empresa_nome: null })
    .eq("empresa_id", id);
  if (unlinkError) {
    return NextResponse.json({ error: unlinkError.message }, { status: 500 });
  }

  const { error: deleteError } = await admin.from("empresas").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await auditDelete("empresa", id, empresaTitle(empresa), gate.user);

  return NextResponse.json({ ok: true });
}
