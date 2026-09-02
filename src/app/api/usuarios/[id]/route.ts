import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdmin } from "@/lib/permissions";

// id é o uuid do usuário (auth.users.id) — nunca Number() aqui, ao contrário
// das outras entidades que usam bigint.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return unauthorized();
  if (!isAdmin(currentUser)) return forbidden();

  const id = params.id;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: before, error: fetchError } = await admin.from("usuarios").select("*").eq("id", id).maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  const willDeactivate = Object.prototype.hasOwnProperty.call(body, "ativo") && body.ativo === false;
  const willDemote = Object.prototype.hasOwnProperty.call(body, "role") && body.role === "usuario";

  // Guarda 1: não deixa o sistema sem nenhum admin ativo. Porta da regra do
  // app.js antigo — conta quantos admins ativos existem e, se este usuário
  // for o único, bloqueia qualquer mudança que o desativaria ou rebaixaria.
  if ((willDeactivate || willDemote) && before.role === "admin" && before.ativo) {
    const { count, error: countError } = await admin
      .from("usuarios")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("ativo", true);
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Não é possível desativar/rebaixar o único administrador ativo." },
        { status: 400 }
      );
    }
  }

  // Guarda 2: ninguém desativa a própria conta (distinta da guarda acima —
  // essa se aplica mesmo havendo outros admins ativos).
  if (willDeactivate && id === currentUser.id) {
    return NextResponse.json({ error: "Você não pode desativar sua própria conta." }, { status: 400 });
  }

  const patch: Record<string, any> = {};
  if (Object.prototype.hasOwnProperty.call(body, "nome")) {
    const nome = (body.nome || "").toString().trim();
    if (!nome) {
      return NextResponse.json({ error: "Informe o nome do usuário." }, { status: 400 });
    }
    patch.nome = nome;
  }
  if (Object.prototype.hasOwnProperty.call(body, "role")) {
    if (body.role !== "admin" && body.role !== "usuario") {
      return NextResponse.json({ error: "Perfil inválido. Use 'admin' ou 'usuario'." }, { status: 400 });
    }
    patch.role = body.role;
  }
  if (Object.prototype.hasOwnProperty.call(body, "ativo")) patch.ativo = !!body.ativo;
  if (Object.prototype.hasOwnProperty.call(body, "permissoes")) patch.permissoes = body.permissoes;

  const { data: after, error: updateError } = await admin
    .from("usuarios")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Log leve, só descritivo (entidade_id não tem sentido pra um uuid num
  // campo bigint) — igual ao POST de criação de usuário.
  await supabaseAdmin().from("audit_log").insert({
    entidade: "usuario",
    entidade_id: 0,
    entidade_label: after.nome,
    acao: "editar",
    campo: null,
    campo_label: null,
    de: null,
    para: null,
    usuario_id: currentUser.id,
    usuario_nome: currentUser.nome,
  });

  return NextResponse.json(after);
}

export async function DELETE() {
  // App antigo nunca exclui usuários de fato, só desativa via PATCH
  // ativo:false — preserva o histórico de auditoria vinculado ao usuário.
  return NextResponse.json(
    { error: "Use PATCH com ativo:false para desativar um usuário." },
    { status: 405 }
  );
}
