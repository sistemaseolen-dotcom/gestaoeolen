import { NextResponse } from "next/server";
import { supabaseServerSession } from "@/lib/supabaseServerSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const email = (body?.email || "").toString().trim().toLowerCase();
  const senha = (body?.senha || "").toString();
  if (!email || !senha) {
    return NextResponse.json({ error: "Informe e-mail e senha." }, { status: 400 });
  }

  const sessionClient = supabaseServerSession();
  const { data, error } = await sessionClient.auth.signInWithPassword({ email, password: senha });

  if (error || !data.user) {
    return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: perfil, error: perfilError } = await admin
    .from("usuarios")
    .select("id, nome, email, role, ativo, permissoes, must_change_password")
    .eq("id", data.user.id)
    .maybeSingle();

  if (perfilError || !perfil) {
    await sessionClient.auth.signOut();
    return NextResponse.json({ error: "Usuário sem cadastro no sistema." }, { status: 401 });
  }

  if (!perfil.ativo) {
    await sessionClient.auth.signOut();
    return NextResponse.json({ error: "Este usuário está desativado." }, { status: 403 });
  }

  await admin.from("usuarios").update({ ultimo_login_em: new Date().toISOString() }).eq("id", perfil.id);

  return NextResponse.json({ usuario: perfil });
}
