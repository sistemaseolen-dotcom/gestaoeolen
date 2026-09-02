import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields, auditDelete } from "@/lib/audit";

const CAMPOS_TREINAMENTO = [
  "tipo", "categoria", "situacao_original", "vencimento", "data_emissao", "observacao",
] as const;

const CATEGORIAS_VALIDAS = ["treinamento", "documento"] as const;
const SITUACOES_VALIDAS = ["", "VALIDO", "RENOVAR", "VENCIDO"] as const;

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("documentos", "editar");
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

  const { data: before, error: fetchError } = await admin
    .from("treinamentos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: "Treinamento/documento não encontrado." }, { status: 404 });
  }

  const patch: Record<string, any> = {};

  if (Object.prototype.hasOwnProperty.call(body, "tipo")) {
    const tipo = (body.tipo || "").toString().trim();
    if (!tipo) {
      return NextResponse.json({ error: "Informe o tipo do treinamento/documento." }, { status: 400 });
    }
    patch.tipo = tipo;
  }
  if (Object.prototype.hasOwnProperty.call(body, "categoria")) {
    const categoria = (body.categoria || "").toString().trim();
    if (!CATEGORIAS_VALIDAS.includes(categoria as (typeof CATEGORIAS_VALIDAS)[number])) {
      return NextResponse.json({ error: "Categoria inválida. Use 'treinamento' ou 'documento'." }, { status: 400 });
    }
    patch.categoria = categoria;
  }
  if (Object.prototype.hasOwnProperty.call(body, "situacaoOriginal")) {
    const situacaoOriginal = String(body.situacaoOriginal ?? "");
    if (!SITUACOES_VALIDAS.includes(situacaoOriginal as (typeof SITUACOES_VALIDAS)[number])) {
      return NextResponse.json({ error: "Situação inválida." }, { status: 400 });
    }
    patch.situacao_original = situacaoOriginal;
  }
  if (Object.prototype.hasOwnProperty.call(body, "vencimento")) patch.vencimento = body.vencimento ?? null;
  if (Object.prototype.hasOwnProperty.call(body, "dataEmissao")) patch.data_emissao = body.dataEmissao ?? null;
  if (Object.prototype.hasOwnProperty.call(body, "observacao")) patch.observacao = body.observacao ?? null;

  const { data: after, error: updateError } = await admin
    .from("treinamentos")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await auditDiffFields({
    entidade: "treinamento",
    entidadeId: id,
    entidadeLabel: `${after.tipo} — ${after.pessoa_nome}`,
    before,
    after,
    campos: [...CAMPOS_TREINAMENTO],
    usuario: gate.user,
  });

  return NextResponse.json(after);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("documentos", "excluir");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: treinamento, error: fetchError } = await admin
    .from("treinamentos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!treinamento) {
    return NextResponse.json({ error: "Treinamento/documento não encontrado." }, { status: 404 });
  }

  // Remoção do anexo no Storage é best-effort: se falhar, seguimos com o
  // delete da linha mesmo assim — o registro no banco é o que importa mais,
  // um arquivo órfão no bucket não quebra nada.
  if (treinamento.arquivo_path) {
    const { error: storageError } = await admin.storage
      .from("treinamentos-anexos")
      .remove([treinamento.arquivo_path]);
    if (storageError) {
      console.error(`Falha ao remover anexo ${treinamento.arquivo_path} do storage:`, storageError.message);
    }
  }

  const { error: deleteError } = await admin.from("treinamentos").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await auditDelete("treinamento", id, `${treinamento.tipo} — ${treinamento.pessoa_nome}`, gate.user);

  return NextResponse.json({ ok: true });
}
