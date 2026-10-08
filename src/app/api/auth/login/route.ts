import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { supabaseServerSession } from "@/lib/supabaseServerSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEVICE_COOKIE, DEVICE_COOKIE_OPTIONS, DEVICE_COOKIE_PENDING_OPTIONS } from "@/lib/deviceCookie";
import { enviarEmail } from "@/lib/msGraphMail";

// Rate limiting do login (revisão de segurança, 10/2026) — sem isso, nada
// impedia tentar senhas repetidamente contra um e-mail conhecido além do
// que o Supabase Auth já faz por padrão. Guarda tentativas falhas por
// e-mail na tabela `login_tentativas` (não por IP: é o e-mail que o
// atacante precisa fixar pra tentar senhas, e IP sozinho erra fácil em
// redes compartilhadas/4G).
const MAX_TENTATIVAS = 5;
const JANELA_MINUTOS = 15; // tentativas fora dessa janela não contam mais pro limite
const BLOQUEIO_MINUTOS = 15;

// Verificação de dispositivo desconhecido (revisão de segurança, 10/2026,
// pedido do Diego): só existe UM dispositivo "principal" por usuário por
// vez. Login de um dispositivo diferente do salvo em
// `usuarios.dispositivo_confiavel_id` exige confirmar um código de 6
// números mandado por e-mail (ver POST /api/auth/verificar-dispositivo)
// antes de contar como logado — quem nunca teve um dispositivo salvo (ex.:
// primeiro login desde que este recurso foi ligado) tem o dispositivo atual
// confiado automaticamente, sem precisar de código.
const CODIGO_EXPIRACAO_MINUTOS = 10;

function gerarCodigo6(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

async function verificarBloqueio(email: string): Promise<{ bloqueado: boolean; minutosRestantes?: number }> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("login_tentativas").select("bloqueado_until").eq("email", email).maybeSingle();
  if (!data?.bloqueado_until) return { bloqueado: false };
  const ate = new Date(data.bloqueado_until).getTime();
  if (ate <= Date.now()) return { bloqueado: false };
  return { bloqueado: true, minutosRestantes: Math.ceil((ate - Date.now()) / 60000) };
}

async function registrarTentativaFalha(email: string) {
  const admin = supabaseAdmin();
  const { data: atual } = await admin
    .from("login_tentativas")
    .select("tentativas, primeira_tentativa_em")
    .eq("email", email)
    .maybeSingle();

  const agora = new Date();
  const dentroDaJanela =
    atual?.primeira_tentativa_em && agora.getTime() - new Date(atual.primeira_tentativa_em).getTime() < JANELA_MINUTOS * 60_000;

  const tentativas = dentroDaJanela ? (atual?.tentativas || 0) + 1 : 1;
  const primeiraTentativaEm = dentroDaJanela ? atual!.primeira_tentativa_em : agora.toISOString();
  const bloqueadoUntil = tentativas >= MAX_TENTATIVAS ? new Date(agora.getTime() + BLOQUEIO_MINUTOS * 60_000).toISOString() : null;

  await admin.from("login_tentativas").upsert({
    email,
    tentativas,
    primeira_tentativa_em: primeiraTentativaEm,
    bloqueado_until: bloqueadoUntil,
    atualizado_em: agora.toISOString(),
  });
}

async function limparTentativas(email: string) {
  await supabaseAdmin().from("login_tentativas").delete().eq("email", email);
}

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

  const bloqueio = await verificarBloqueio(email);
  if (bloqueio.bloqueado) {
    return NextResponse.json(
      { error: `Muitas tentativas de login. Tente novamente em ${bloqueio.minutosRestantes} minuto(s).` },
      { status: 429 }
    );
  }

  const sessionClient = await supabaseServerSession();
  const { data, error } = await sessionClient.auth.signInWithPassword({ email, password: senha });

  if (error || !data.user) {
    await registrarTentativaFalha(email);
    return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  await limparTentativas(email);

  const admin = supabaseAdmin();
  const { data: perfil, error: perfilError } = await admin
    .from("usuarios")
    .select("id, nome, email, role, ativo, permissoes, must_change_password, dispositivo_confiavel_id")
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

  const agora = new Date().toISOString();
  const cookieStore = await cookies();
  const deviceIdAtual = cookieStore.get(DEVICE_COOKIE)?.value;
  const { dispositivo_confiavel_id, ...perfilSemDevice } = perfil;

  // Nunca teve um dispositivo salvo (ex.: primeiro login desde que este
  // recurso foi ligado) — confia neste dispositivo automaticamente, sem
  // pedir código.
  if (!dispositivo_confiavel_id) {
    const novoDeviceId = deviceIdAtual || crypto.randomBytes(24).toString("hex");
    await admin
      .from("usuarios")
      .update({ dispositivo_confiavel_id: novoDeviceId, dispositivo_atualizado_em: agora, ultimo_login_em: agora })
      .eq("id", perfil.id);

    const response = NextResponse.json({ usuario: perfilSemDevice });
    response.cookies.set(DEVICE_COOKIE, novoDeviceId, DEVICE_COOKIE_OPTIONS);
    return response;
  }

  // Dispositivo já confiável — login normal.
  if (deviceIdAtual && deviceIdAtual === dispositivo_confiavel_id) {
    await admin.from("usuarios").update({ ultimo_login_em: agora }).eq("id", perfil.id);
    return NextResponse.json({ usuario: perfilSemDevice });
  }

  // Dispositivo diferente do salvo — exige código de 6 números por e-mail
  // antes de contar como logado.
  const candidatoDeviceId = crypto.randomBytes(24).toString("hex");
  const codigo = gerarCodigo6();
  const codigoHash = crypto.createHash("sha256").update(codigo).digest("hex");

  await admin.from("login_verificacoes").insert({
    usuario_id: perfil.id,
    device_id: candidatoDeviceId,
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
        <p>Detectamos um login da sua conta num dispositivo diferente do habitual. Pra confirmar que é você, digite o código abaixo:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${codigo}</p>
        <p>Esse código expira em ${CODIGO_EXPIRACAO_MINUTOS} minutos. Se não foi você quem tentou entrar, troque sua senha e avise o administrador do sistema.</p>
      `,
    });
  } catch (e) {
    console.error("Falha ao enviar código de verificação de dispositivo:", e);
    await sessionClient.auth.signOut();
    return NextResponse.json(
      { error: "Não foi possível enviar o código de verificação. Tente novamente em alguns instantes." },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ verificacaoDispositivoNecessaria: true });
  response.cookies.set(DEVICE_COOKIE, candidatoDeviceId, DEVICE_COOKIE_PENDING_OPTIONS);
  return response;
}
