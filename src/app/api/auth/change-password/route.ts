import { NextResponse } from "next/server";
import { supabaseServerSession } from "@/lib/supabaseServerSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Troca a própria senha — usado tanto no fluxo de "senha temporária" (login
// forçando troca, igual ao comportamento antigo do app.js) quanto numa
// troca de senha voluntária.
export async function POST(req: Request) {
  const sessionClient = supabaseServerSession();
  const {
    data: { user: authUser },
  } = await sessionClient.auth.getUser();
  if (!authUser) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const nova = (body?.nova || "").toString();
  const confirmar = (body?.confirmar || "").toString();
  if (nova.length < 6) {
    return NextResponse.json({ error: "A nova senha deve ter pelo menos 6 caracteres." }, { status: 400 });
  }
  if (nova !== confirmar) {
    return NextResponse.json({ error: "As senhas não coincidem." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error: updateError } = await admin.auth.admin.updateUserById(authUser.id, { password: nova });
  if (updateError) {
    return NextResponse.json({ error: "Não foi possível atualizar a senha." }, { status: 500 });
  }

  await admin.from("usuarios").update({ must_change_password: false }).eq("id", authUser.id);

  return NextResponse.json({ ok: true });
}
