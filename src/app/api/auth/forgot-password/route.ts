import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enviarEmail } from "@/lib/msGraphMail";
import { logAcesso } from "@/lib/accessLog";

// "Esqueci minha senha" (revisão de segurança, 10/2026) — gera um token de
// uso único e manda por e-mail via Microsoft Graph (ver src/lib/msGraphMail.ts,
// não o mailer padrão do Supabase). A resposta é SEMPRE a mesma, exista ou
// não o e-mail cadastrado (anti-enumeração) — nunca revela se um e-mail
// está ou não no sistema.

const EXPIRACAO_MINUTOS = 30;
const RESPOSTA_PADRAO = {
  ok: true,
  mensagem: "Se este e-mail estiver cadastrado, você vai receber um link para redefinir sua senha em alguns minutos.",
};

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const email = (body?.email || "").toString().trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Informe o e-mail." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: usuario } = await admin
    .from("usuarios")
    .select("id, nome, email, ativo")
    .eq("email", email)
    .maybeSingle();

  // Mesma resposta exista ou não o usuário, ativo ou não — quem pergunta
  // não pode descobrir se um e-mail está cadastrado só por isso. O log
  // técnico interno (nunca exposto na resposta) ainda guarda a diferença,
  // pra permitir rastrear tentativas contra e-mails que não existem.
  if (!usuario || !usuario.ativo) {
    await logAcesso({ usuarioEmail: email, acao: "esqueci_senha:nao_encontrado" });
    return NextResponse.json(RESPOSTA_PADRAO);
  }

  await logAcesso({
    usuarioId: usuario.id,
    usuarioNome: usuario.nome,
    usuarioEmail: usuario.email,
    acao: "esqueci_senha:solicitado",
  });

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiraEm = new Date(Date.now() + EXPIRACAO_MINUTOS * 60_000).toISOString();

  await admin.from("reset_senha_tokens").insert({
    usuario_id: usuario.id,
    token_hash: tokenHash,
    expira_em: expiraEm,
  });

  const origin = new URL(req.url).origin;
  const link = `${origin}/#/redefinir-senha/${token}`;
  const primeiroNome = (usuario.nome || "").split(" ")[0] || "";

  try {
    await enviarEmail({
      para: usuario.email,
      assunto: "Redefinição de senha — Controle Eolen",
      htmlBody: `
        <p>Olá, ${primeiroNome}.</p>
        <p>Recebemos um pedido para redefinir a senha da sua conta no Controle Eolen.</p>
        <p><a href="${link}">Clique aqui para escolher uma nova senha</a></p>
        <p>Esse link expira em ${EXPIRACAO_MINUTOS} minutos e só pode ser usado uma vez.</p>
        <p>Se você não pediu essa redefinição, pode ignorar este e-mail — sua senha atual continua válida.</p>
      `,
    });
  } catch (e) {
    // Não revela o erro pro cliente (evita diferenciar "deu erro" de
    // "e-mail não existe"), mas loga pra investigar depois.
    console.error("Falha ao enviar e-mail de redefinição de senha:", e);
  }

  return NextResponse.json(RESPOSTA_PADRAO);
}
