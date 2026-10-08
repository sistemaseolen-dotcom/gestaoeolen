import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Confirma a redefinição de senha a partir do token mandado por e-mail em
// /api/auth/forgot-password. Token é comparado por hash (nunca guardamos o
// valor puro) e só vale uma vez.
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const token = (body?.token || "").toString();
  const nova = (body?.nova || "").toString();
  const confirmar = (body?.confirmar || "").toString();

  if (!token) {
    return NextResponse.json({ error: "Link inválido." }, { status: 400 });
  }
  if (nova.length < 6) {
    return NextResponse.json({ error: "A nova senha deve ter pelo menos 6 caracteres." }, { status: 400 });
  }
  if (nova !== confirmar) {
    return NextResponse.json({ error: "As senhas não coincidem." }, { status: 400 });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const admin = supabaseAdmin();

  const { data: registro } = await admin
    .from("reset_senha_tokens")
    .select("id, usuario_id, expira_em, usado")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!registro || registro.usado || new Date(registro.expira_em).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Este link é inválido ou já expirou. Peça um novo link de redefinição." },
      { status: 400 }
    );
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(registro.usuario_id, { password: nova });
  if (updateError) {
    return NextResponse.json({ error: "Não foi possível atualizar a senha." }, { status: 500 });
  }

  await admin.from("reset_senha_tokens").update({ usado: true }).eq("id", registro.id);
  await admin.from("usuarios").update({ must_change_password: false }).eq("id", registro.usuario_id);

  // Limpa bloqueio/tentativas de login antigas — a pessoa acabou de provar
  // controle do e-mail cadastrado, não faz sentido continuar bloqueada por
  // tentativas de senha de antes da redefinição.
  const { data: usuario } = await admin.from("usuarios").select("email").eq("id", registro.usuario_id).maybeSingle();
  if (usuario?.email) {
    await admin.from("login_tentativas").delete().eq("email", usuario.email);
  }

  return NextResponse.json({ ok: true });
}
