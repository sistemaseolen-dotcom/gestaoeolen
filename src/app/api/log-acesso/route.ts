import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Leitura do log técnico de acessos (IP, localização aproximada,
// dispositivo) — pedido do Diego, 10/2026. Diferente de /api/audit-log
// (qualquer usuário logado pode ler), aqui é só pra administradores: revela
// IP e localização de todo mundo, informação mais sensível que "quem editou
// o campo X".
const PAGE_SIZE_PADRAO = 50;
const PAGE_SIZE_MAX = 200;

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
      `usuario_nome.ilike.${termo},usuario_email.ilike.${termo},ip.ilike.${termo},cidade.ilike.${termo},pais.ilike.${termo},detalhe.ilike.${termo}`
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
