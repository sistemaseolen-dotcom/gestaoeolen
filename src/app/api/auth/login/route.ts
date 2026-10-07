import { NextResponse } from "next/server";
import { supabaseServerSession } from "@/lib/supabaseServerSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Rate limiting do login (revisão de segurança, 10/2026) — sem isso, nada
// impedia tentar senhas repetidamente contra um e-mail conhecido além do
// que o Supabase Auth já faz por padrão. Guarda tentativas falhas por
// e-mail na tabela `login_tentativas` (não por IP: é o e-mail que o
// atacante precisa fixar pra tentar senhas, e IP sozinho erra fácil em
// redes compartilhadas/4G).
const MAX_TENTATIVAS = 5;
const JANELA_MINUTOS = 15; // tentativas fora dessa janela não contam mais pro limite
const BLOQUEIO_MINUTOS = 15;

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
