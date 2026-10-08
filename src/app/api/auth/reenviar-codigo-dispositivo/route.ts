import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { supabaseServerSession } from "@/lib/supabaseServerSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEVICE_COOKIE } from "@/lib/deviceCookie";
import { enviarEmail } from "@/lib/msGraphMail";

// Reenvia o código de verificação de dispositivo (caso o primeiro e-mail
// demore ou se perca) — com um intervalo mínimo entre reenvios pra não virar
// uma forma de espamar a caixa de entrada da pessoa.
const REENVIO_MINIMO_SEGUNDOS = 60;
const CODIGO_EXPIRACAO_MINUTOS = 10;

function gerarCodigo6(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function POST() {
  const sessionClient = await supabaseServerSession();
  const {
    data: { user: authUser },
  } = await sessionClient.auth.getUser();
  if (!authUser) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const cookieStore = await cookies();
  const deviceId = cookieStore.get(DEVICE_COOKIE)?.value;
  if (!deviceId) {
    return NextResponse.json({ error: "Sessão de verificação expirada. Faça login novamente." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: anterior } = await admin
    .from("login_verificacoes")
    .select("id, criado_em")
    .eq("usuario_id", authUser.id)
    .eq("device_id", deviceId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (anterior && Date.now() - new Date(anterior.criado_em).getTime() < REENVIO_MINIMO_SEGUNDOS * 1000) {
    return NextResponse.json({ error: "Aguarde um pouco antes de pedir um novo código." }, { status: 429 });
  }

  const { data: perfil } = await admin.from("usuarios").select("email, nome").eq("id", authUser.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  const codigo = gerarCodigo6();
  const codigoHash = crypto.createHash("sha256").update(codigo).digest("hex");

  if (anterior) {
    await admin.from("login_verificacoes").delete().eq("id", anterior.id);
  }

  await admin.from("login_verificacoes").insert({
    usuario_id: authUser.id,
    device_id: deviceId,
    codigo_hash: codigoHash,
    expira_em: new Date(Date.now() + CODIGO_EXPIRACAO_MINUTOS * 60_000).toISOString(),
  });

  const primeiroNome = (perfil.nome || "").split(" ")[0] || "";

  try {
    await enviarEmail({
      para: perfil.email,
      assunto: "Código de verificação — Controle Eolen",
      htmlBody: `
        <p>Olá, ${primeiroNome}.</p>
        <p>Seu novo código de verificação é:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${codigo}</p>
        <p>Esse código expira em ${CODIGO_EXPIRACAO_MINUTOS} minutos.</p>
      `,
    });
  } catch (e) {
    console.error("Falha ao reenviar código de verificação de dispositivo:", e);
    return NextResponse.json({ error: "Não foi possível enviar o código. Tente novamente em alguns instantes." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
