import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const PAGE_SIZE_PADRAO = 50;
const PAGE_SIZE_MAX = 200;

// Qualquer usuário logado pode ler o histórico — no app antigo o painel de
// histórico por registro era visível a quem enxergasse aquele registro, e a
// tela cheia de Admin > "Log de alterações" não tinha um gate próprio além
// de estar logado. Mantemos simples aqui, sem exigir isAdmin.
export async function GET(req: Request) {
  const gate = await requireAuth();
  if (gate.response) return gate.response;

  const { searchParams } = new URL(req.url);
  const entidade = searchParams.get("entidade");
  const entidadeIdRaw = searchParams.get("entidadeId");
  const acao = searchParams.get("acao");
  const q = searchParams.get("q");

  let entidadeId: number | null = null;
  if (entidadeIdRaw !== null) {
    entidadeId = Number(entidadeIdRaw);
    if (Number.isNaN(entidadeId)) {
      return NextResponse.json({ error: "entidadeId inválido." }, { status: 400 });
    }
  }

  const pageRaw = Number(searchParams.get("page"));
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const pageSizeRaw = Number(searchParams.get("pageSize"));
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
    ? Math.min(Math.floor(pageSizeRaw), PAGE_SIZE_MAX)
    : PAGE_SIZE_PADRAO;

  let query = supabaseAdmin()
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("ts", { ascending: false });

  if (entidade) query = query.eq("entidade", entidade);
  if (entidadeId !== null) query = query.eq("entidade_id", entidadeId);
  if (acao) query = query.eq("acao", acao);
  if (q) {
    const termo = `%${q}%`;
    query = query.or(
      `entidade_label.ilike.${termo},campo_label.ilike.${termo},de.ilike.${termo},para.ilike.${termo}`
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
