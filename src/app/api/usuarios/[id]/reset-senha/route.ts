import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdmin } from "@/lib/permissions";

// id é o uuid do usuário — nunca Number() aqui.
export async function POST(req: Request, { params }: { params: { id: string } }) {
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

  const novaSenhaTemporaria = (body?.novaSenhaTemporaria || "").toString();
  if (!novaSenhaTemporaria || novaSenhaTemporaria.length < 6) {
    return NextResponse.json({ error: "A senha temporária deve ter pelo menos 6 caracteres." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { error: authError } = await admin.auth.admin.updateUserById(id, { password: novaSenhaTemporaria });
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Força troca de senha no próximo login — a senha temporária foi entregue
  // fora de banda (o admin repassa ao usuário), mesmo fluxo do app antigo.
  const { error: updateError } = await admin
    .from("usuarios")
    .update({ must_change_password: true })
    .eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
