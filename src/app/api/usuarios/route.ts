import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdmin, emptyPermissoes } from "@/lib/permissions";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAdmin(user)) return forbidden();

  // usuarios não guarda hash de senha (isso fica no Supabase Auth) — select
  // "*" é seguro aqui.
  const { data, error } = await supabaseAdmin().from("usuarios").select("*").order("nome");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ usuarios: data });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAdmin(user)) return forbidden();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const nome = (body?.nome || "").toString().trim();
  const email = (body?.email || "").toString().trim().toLowerCase();
  const senha = (body?.senha || "").toString();
  const role = (body?.role || "").toString().trim();

  if (!nome) return NextResponse.json({ error: "Informe o nome do usuário." }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Informe o e-mail do usuário." }, { status: 400 });
  if (!senha) return NextResponse.json({ error: "Informe a senha do usuário." }, { status: 400 });
  if (senha.length < 6) {
    return NextResponse.json({ error: "A senha deve ter pelo menos 6 caracteres." }, { status: 400 });
  }
  if (role !== "admin" && role !== "usuario") {
    return NextResponse.json({ error: "Perfil inválido. Use 'admin' ou 'usuario'." }, { status: 400 });
  }
  if (role === "usuario" && !body?.permissoes) {
    return NextResponse.json({ error: "Informe as permissões do usuário." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message || "Falha ao criar usuário." }, { status: 400 });
  }

  const permissoes = role === "admin" ? emptyPermissoes() : body.permissoes;

  const { data: perfil, error: perfilError } = await admin
    .from("usuarios")
    .insert({
      id: authData.user.id,
      nome,
      email,
      role,
      ativo: true,
      permissoes,
      must_change_password: true,
      criado_por: user.nome,
    })
    .select()
    .single();
  if (perfilError) {
    // Não fazemos rollback do usuário criado no Auth aqui: é uma borda rara
    // (falha entre os dois inserts) e a compensação completa não vale a
    // complexidade extra para este endpoint — fica um usuário Auth órfão,
    // sem linha em `usuarios`, que não consegue logar (getCurrentUser exige
    // perfil correspondente) e pode ser limpo manualmente se acontecer.
    return NextResponse.json({ error: perfilError.message }, { status: 500 });
  }

  await supabaseAdmin().from("audit_log").insert({
    entidade: "usuario",
    entidade_id: 0,
    entidade_label: nome,
    acao: "criar",
    campo: null,
    campo_label: null,
    de: null,
    para: null,
    usuario_id: user.id,
    usuario_nome: user.nome,
  });

  return NextResponse.json(perfil, { status: 201 });
}
