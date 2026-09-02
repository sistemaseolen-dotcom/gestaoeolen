import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";

const CAMPOS_TREINAMENTO = [
  "tipo", "categoria", "situacao_original", "vencimento", "data_emissao", "observacao",
] as const;

const CATEGORIAS_VALIDAS = ["treinamento", "documento"] as const;
const SITUACOES_VALIDAS = ["", "VALIDO", "RENOVAR", "VENCIDO"] as const;

export async function POST(req: Request) {
  // Permissão é "documentos" (não "treinamentos") — treinamentos e
  // documentos compartilham a mesma tela/matriz de permissões no app antigo.
  const gate = await requirePermission("documentos", "criar");
  if (gate.response) return gate.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const pessoaId = Number(body?.pessoaId);
  if (Number.isNaN(pessoaId)) {
    return NextResponse.json({ error: "Informe a pessoa do treinamento/documento." }, { status: 400 });
  }

  const tipo = (body?.tipo || "").toString().trim();
  if (!tipo) {
    return NextResponse.json({ error: "Informe o tipo do treinamento/documento." }, { status: 400 });
  }

  const categoria = (body?.categoria || "").toString().trim();
  if (!CATEGORIAS_VALIDAS.includes(categoria as (typeof CATEGORIAS_VALIDAS)[number])) {
    return NextResponse.json({ error: "Categoria inválida. Use 'treinamento' ou 'documento'." }, { status: 400 });
  }

  const situacaoOriginal = body?.situacaoOriginal !== undefined ? String(body.situacaoOriginal) : "";
  if (!SITUACOES_VALIDAS.includes(situacaoOriginal as (typeof SITUACOES_VALIDAS)[number])) {
    return NextResponse.json({ error: "Situação inválida." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: pessoa, error: pessoaError } = await admin
    .from("pessoas")
    .select("id, nome")
    .eq("id", pessoaId)
    .maybeSingle();
  if (pessoaError) {
    return NextResponse.json({ error: pessoaError.message }, { status: 500 });
  }
  if (!pessoa) {
    return NextResponse.json({ error: "Pessoa não encontrada." }, { status: 404 });
  }

  const payload = {
    pessoa_id: pessoaId,
    pessoa_nome: pessoa.nome,
    tipo,
    categoria,
    situacao_original: situacaoOriginal,
    vencimento: body?.vencimento ?? null,
    data_emissao: body?.dataEmissao ?? null,
    observacao: body?.observacao ?? null,
  };

  const { data, error } = await admin.from("treinamentos").insert(payload).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auditDiffFields({
    entidade: "treinamento",
    entidadeId: data.id,
    entidadeLabel: `${data.tipo} — ${data.pessoa_nome}`,
    before: null,
    after: data,
    campos: [...CAMPOS_TREINAMENTO],
    usuario: gate.user,
  });

  return NextResponse.json(data, { status: 201 });
}
