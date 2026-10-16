import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields, auditDelete } from "@/lib/audit";

// PATCH só troca `ativo` (revogar/reativar) e `observacao` -- nunca dá pra
// "ver"/trocar o token em si (não existe update de token_hash aqui); quem
// quiser um valor novo pede pra excluir este e criar outro.
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: before, error: fetchError } = await admin
    .from("api_tokens")
    .select("id, nome, ativo, observacao")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Token não encontrado." }, { status: 404 });

  const patch: Record<string, any> = {};
  if (Object.prototype.hasOwnProperty.call(body || {}, "ativo")) patch.ativo = !!body.ativo;
  if (Object.prototype.hasOwnProperty.call(body || {}, "observacao")) patch.observacao = body.observacao ? String(body.observacao).trim() : null;

  const { data: after, error: updateError } = await admin
    .from("api_tokens")
    .update(patch)
    .eq("id", id)
    .select("id, nome, token_prefixo, ativo, criado_em, criado_por_nome, ultimo_uso_em, observacao")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await auditDiffFields({
    entidade: "api_token",
    entidadeId: id,
    entidadeLabel: after.nome,
    before,
    after,
    campos: ["nome", "ativo", "observacao"],
    usuario: gate.user,
  });

  return NextResponse.json(after);
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: token, error: fetchError } = await admin.from("api_tokens").select("id, nome").eq("id", id).maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!token) return NextResponse.json({ error: "Token não encontrado." }, { status: 404 });

  const { error: deleteError } = await admin.from("api_tokens").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  await auditDelete("api_token", id, token.nome, gate.user);

  return NextResponse.json({ ok: true });
}
