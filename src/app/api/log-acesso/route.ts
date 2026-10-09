import { NextResponse } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logAcesso } from "@/lib/accessLog";

// Leitura do log técnico de acessos (IP, localização aproximada,
// dispositivo) — pedido do Diego, 10/2026. Diferente de /api/audit-log
// (qualquer usuário logado pode ler), aqui é só pra administradores: revela
// IP e localização de todo mundo, informação mais sensível que "quem editou
// o campo X".
const PAGE_SIZE_PADRAO = 50;
const PAGE_SIZE_MAX = 200;

// Limites de tamanho pros campos de texto livre que o POST abaixo aceita —
// nunca confiamos em string vinda do cliente sem um teto.
const MAX_TEXTO = 300;
function truncar(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > MAX_TEXTO ? s.slice(0, MAX_TEXTO) : s;
}

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const { searchParams } = new URL(req.url);
  const acao = searchParams.get("acao");
  const q = searchParams.get("q");

  const pageRaw = Number(searchParams.get("page"));
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const pageSizeRaw = Number(searchParams.get("pageSize"));
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
    ? Math.min(Math.floor(pageSizeRaw), PAGE_SIZE_MAX)
    : PAGE_SIZE_PADRAO;

  let query = supabaseAdmin()
    .from("log_acesso")
    .select("*", { count: "exact" })
    .order("ts", { ascending: false });

  if (acao) query = query.eq("acao", acao);
  if (q) {
    const termo = `%${q}%`;
    query = query.or(
      `usuario_nome.ilike.${termo},usuario_email.ilike.${termo},ip.ilike.${termo},cidade.ilike.${termo},pais.ilike.${termo},detalhe.ilike.${termo},acao.ilike.${termo},rota.ilike.${termo}`
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data, total: count ?? 0, page, pageSize });
}

/**
 * Registra uma "visualização de tela" disparada pelo próprio front-end
 * (pedido do Diego, 10/2026: ele queria que QUALQUER acesso gerasse log,
 * não só alterações — incluindo só abrir o perfil de alguém pra consultar).
 * A SPA inteira é uma página só que já carrega tudo de uma vez em
 * /api/state e troca de tela sem bater no servidor de novo (lê STATE em
 * memória), então não tem como o servidor registrar sozinho "abriu o
 * cadastro da pessoa X" — por isso o front-end avisa aqui a cada troca de
 * rota (ver logPageView no app.js). Só exige estar logado: o usuário e o
 * IP/dispositivo vêm sempre da sessão do servidor, nunca do corpo da
 * requisição — o cliente só informa O QUE foi visto, nunca QUEM viu.
 */
export async function POST(req: Request) {
  const gate = await requireAuth();
  if (gate.response) return gate.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const pagina = truncar(body?.pagina) || "desconhecida";
  const rota = truncar(body?.rota);
  const detalhe = truncar(body?.detalhe);

  await logAcesso({
    usuarioId: gate.user.id,
    usuarioNome: gate.user.nome,
    usuarioEmail: gate.user.email,
    acao: `${pagina}:ver_tela`,
    detalhe,
    rota,
    metodo: "GET",
  });

  return NextResponse.json({ ok: true });
}
