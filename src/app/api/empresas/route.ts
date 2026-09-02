import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";

// Campos editáveis da empresa — mesma lista usada no diff de auditoria e na
// aplicação parcial de PATCH (ver [id]/route.ts).
const CAMPOS_EMPRESA = [
  "nome", "fantasia", "cnpj", "porte", "cidade", "uf", "cep", "bairro", "logradouro",
  "numero", "telefone", "email", "nome_responsavel", "regional", "cnae_principal",
  "cnae_descricao", "pgr", "pcmso", "situacao_cadastral", "status", "contratos",
  "tipo_pj", "observacao",
] as const;

// Mapeia o corpo da requisição (chaves "camelCase-ish" iguais ao formulário
// da versão antiga) para as colunas snake_case da tabela `empresas`.
function empresaFromBody(body: any): Record<string, any> {
  return {
    nome: body?.nome,
    fantasia: body?.fantasia,
    cnpj: body?.cnpj,
    porte: body?.porte,
    cidade: body?.cidade,
    uf: body?.uf,
    cep: body?.cep,
    bairro: body?.bairro,
    logradouro: body?.logradouro,
    numero: body?.numero,
    telefone: body?.telefone,
    email: body?.email,
    nome_responsavel: body?.nomeResponsavel,
    regional: body?.regional,
    cnae_principal: body?.cnaePrincipal,
    cnae_descricao: body?.cnaeDescricao,
    pgr: body?.pgr,
    pcmso: body?.pcmso,
    situacao_cadastral: body?.situacaoCadastral,
    status: body?.status,
    contratos: body?.contratos,
    tipo_pj: body?.tipoPJ,
    observacao: body?.observacao,
  };
}

// Porta do empresaTitle() do app.js original: título de exibição usado em
// logs de auditoria e no cache empresa_nome de `pessoas`. Replicado (não
// importado) em cada rota que precisa dele, para não criar exports extras
// num arquivo route.ts do Next.js.
function empresaTitle(e: { fantasia?: string | null; nome?: string | null; cnpj?: string | null }): string {
  return e?.fantasia || e?.nome || (e?.cnpj ? `CNPJ ${e.cnpj}` : "") || "Empresa sem nome";
}

export async function POST(req: Request) {
  const gate = await requirePermission("empresas", "criar");
  if (gate.response) return gate.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const nome = (body?.nome || "").toString().trim();
  if (!nome) {
    return NextResponse.json({ error: "Informe a razão social da empresa." }, { status: 400 });
  }

  const payload = { ...empresaFromBody(body), nome };

  const { data, error } = await supabaseAdmin().from("empresas").insert(payload).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auditDiffFields({
    entidade: "empresa",
    entidadeId: data.id,
    entidadeLabel: empresaTitle(data),
    before: null,
    after: data,
    campos: [...CAMPOS_EMPRESA],
    usuario: gate.user,
  });

  return NextResponse.json(data, { status: 201 });
}
