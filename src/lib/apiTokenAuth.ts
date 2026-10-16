// Autenticação por token pra API EXTERNA (pedido do Diego, 16/10/2026):
// "preciso criar essas API para que outras pessoas tenha acesso as
// informações, mas quero que seja segura, com token" -- "para que a API não
// tenha acesso [à aba Administrador]". Cada integração externa recebe o
// PRÓPRIO token (gerado em /api/admin/api-tokens, só admin), revogável
// individualmente sem afetar as outras -- nunca um token único compartilhado.
//
// Modelo (igual a praticamente qualquer provedor de API conhecido):
// - O token bruto (`eolk_<64 hex>`) só existe em texto puro no momento da
//   criação (devolvido UMA VEZ pra tela de Admin) e no header que o cliente
//   externo manda em cada chamada -- nunca é salvo em texto puro no banco.
// - O banco guarda só o HASH SHA-256 do token (`token_hash`, único) e um
//   prefixo curto (`token_prefixo`) só pra identificar visualmente qual
//   token é qual numa lista, sem conseguir reconstruir o valor original.
// - Perder o token bruto = precisa gerar outro (não tem "esqueci minha
//   senha" aqui, de propósito -- o hash não é reversível).
import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "./supabaseAdmin";

const PREFIXO_TOKEN = "eolk_";

export function gerarApiToken(): { token: string; hash: string; prefixo: string } {
  const bruto = randomBytes(32).toString("hex"); // 64 chars hex, bem acima do praticável pra força bruta
  const token = `${PREFIXO_TOKEN}${bruto}`;
  return { token, hash: hashApiToken(token), prefixo: token.slice(0, PREFIXO_TOKEN.length + 8) };
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export interface ApiTokenRow {
  id: number;
  nome: string;
  ativo: boolean;
}

type GateOk = { token: ApiTokenRow; response: null };
type GateFail = { token: null; response: NextResponse };

// Extrai o token do header `Authorization: Bearer <token>` (padrão de
// mercado) -- aceita também `X-API-Key: <token>` como alternativa pra
// integrações cujo cliente HTTP não deixe configurar o header Authorization
// com facilidade.
function extrairTokenBruto(req: Request): string | null {
  const auth = (req.headers.get("authorization") || "").trim();
  const bearer = /^Bearer\s+(.+)$/i.exec(auth);
  if (bearer) return bearer[1].trim();
  const apiKey = (req.headers.get("x-api-key") || "").trim();
  return apiKey || null;
}

// Use no início de TODA rota em /api/externa/*:
//   const gate = await requireApiToken(req);
//   if (gate.response) return gate.response;
// Nunca confia em permissão de usuário logado (cookie/sessão) -- esta API é
// pra sistemas de fora, sem sessão de navegador alguma.
export async function requireApiToken(req: Request): Promise<GateOk | GateFail> {
  const bruto = extrairTokenBruto(req);
  if (!bruto) {
    return {
      token: null,
      response: NextResponse.json(
        { error: "Token de API ausente. Envie no header 'Authorization: Bearer <token>'." },
        { status: 401 }
      ),
    };
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("api_tokens")
    .select("id, nome, ativo")
    .eq("token_hash", hashApiToken(bruto))
    .maybeSingle();
  if (error) {
    return { token: null, response: NextResponse.json({ error: "Falha ao validar o token." }, { status: 500 }) };
  }
  if (!data || !data.ativo) {
    return { token: null, response: NextResponse.json({ error: "Token inválido ou revogado." }, { status: 401 }) };
  }

  // Best-effort, não atrasa nem quebra a resposta por causa disso.
  admin
    .from("api_tokens")
    .update({ ultimo_uso_em: new Date().toISOString() })
    .eq("id", data.id)
    .then(
      () => {},
      () => {}
    );

  return { token: data, response: null };
}
