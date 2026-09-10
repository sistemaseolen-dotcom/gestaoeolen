import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ usuario: null });

  // "Último login" (tela Administrador → Usuários) só era atualizado no
  // POST /api/auth/login — mas a sessão do Supabase Auth persiste por dias
  // via cookie, então quem já está logado nunca passa pelo formulário de
  // login de novo: o campo ficava parado na última vez que a pessoa
  // realmente digitou a senha, mesmo usando o sistema todos os dias (bug
  // reportado pelo Diego: ele aparecia com login "de ontem" estando online
  // no momento). GET /api/auth/me é chamado uma vez a cada carregamento da
  // página (ver init() no app.js) — atualizar aqui também faz o campo
  // refletir o último acesso de verdade, não só o último login por senha.
  await supabaseAdmin().from("usuarios").update({ ultimo_login_em: new Date().toISOString() }).eq("id", user.id);

  return NextResponse.json({ usuario: user });
}
