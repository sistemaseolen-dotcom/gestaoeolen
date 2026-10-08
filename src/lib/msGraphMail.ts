// Envio de e-mail transacional via Microsoft Graph API (OAuth2 client
// credentials), usando a caixa @eolen.com.br definida em MS_GRAPH_SENDER_EMAIL
// como remetente.
//
// Por que não o SMTP padrão do Supabase nem o SMTP do próprio Office 365:
// - O mailer padrão do Supabase (plano Free) manda só 2 e-mails/hora pro
//   projeto inteiro — baixo demais pra "esqueci senha" + código de
//   dispositivo com várias pessoas usando o sistema.
// - A Microsoft está desativando a autenticação básica (login+senha) do
//   SMTP AUTH do Office 365/Exchange Online pra contas existentes a partir
//   do fim de dezembro/2026 — configurar isso agora seria trocar de novo
//   em poucos meses. A API do Graph com OAuth2 (client credentials) não
//   depende de SMTP AUTH e não tem essa data de desativação.
//
// Credenciais (ver variáveis de ambiente no painel da Vercel):
//   MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET — app
//   registrado no Azure AD com permissão de aplicativo Mail.Send concedida
//   (admin consent) pra caixa MS_GRAPH_SENDER_EMAIL.
//   MS_GRAPH_SENDER_EMAIL — caixa @eolen.com.br usada como remetente.

interface GraphTokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: GraphTokenCache | null = null;

async function getGraphToken(): Promise<string> {
  // Margem de 30s pra nunca usar um token que expira no meio da chamada seguinte.
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.token;
  }

  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Microsoft Graph não configurado: defina MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID e MS_GRAPH_CLIENT_SECRET."
    );
  }

  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => "");
    throw new Error(`Falha ao autenticar no Microsoft Graph (${resp.status}): ${texto}`);
  }

  const data = await resp.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return tokenCache.token;
}

export async function enviarEmail(opts: { para: string; assunto: string; htmlBody: string }): Promise<void> {
  const senderEmail = process.env.MS_GRAPH_SENDER_EMAIL;
  if (!senderEmail) {
    throw new Error("Microsoft Graph não configurado: defina MS_GRAPH_SENDER_EMAIL.");
  }

  const token = await getGraphToken();

  const resp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: opts.assunto,
        body: { contentType: "HTML", content: opts.htmlBody },
        toRecipients: [{ emailAddress: { address: opts.para } }],
      },
      // Não é uma conta de uso pessoal — não precisa poluir a pasta "Itens
      // Enviados" da caixa remetente com cada e-mail transacional.
      saveToSentItems: false,
    }),
  });

  // sendMail devolve 202 Accepted sem corpo quando dá certo.
  if (!resp.ok) {
    const texto = await resp.text().catch(() => "");
    throw new Error(`Falha ao enviar e-mail via Microsoft Graph (${resp.status}): ${texto}`);
  }
}
