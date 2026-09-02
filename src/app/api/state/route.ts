import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Hidratação inicial da SPA — equivalente ao antigo `#seed-data` embutido na
// página. NÃO inclui usuarios nem audit_log (essa última é paginada à parte
// via /api/audit-log, pois só cresce e não faz sentido carregar tudo de uma
// vez). O front-end monta STATE.listas a partir de listas_opcoes agrupadas
// por `lista`.
// O PostgREST do Supabase limita cada resposta a um número máximo de linhas
// (configurado no projeto, geralmente 1000) mesmo sem LIMIT explícito no
// código — qualquer tabela que passe desse tamanho vem cortada em silêncio,
// sem erro. `treinamentos` já passou de 8000 linhas, então buscamos todas as
// tabelas em páginas de 1000 e concatenamos, em vez de confiar num único
// `select("*")`.
async function fetchAllRows(admin: ReturnType<typeof supabaseAdmin>, table: string) {
  const pageSize = 1000;
  let from = 0;
  const all: any[] = [];
  for (;;) {
    const { data, error } = await admin.from(table).select("*").order("id").range(from, from + pageSize - 1);
    if (error) return { data: null as any[] | null, error };
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null as any };
}

export async function GET() {
  const gate = await requireAuth();
  if (gate.response) return gate.response;

  const admin = supabaseAdmin();

  const [pessoas, empresas, treinamentos, equipes, equipeMembros, listasOpcoes] = await Promise.all([
    fetchAllRows(admin, "pessoas"),
    fetchAllRows(admin, "empresas"),
    fetchAllRows(admin, "treinamentos"),
    fetchAllRows(admin, "equipes"),
    fetchAllRows(admin, "equipe_membros"),
    fetchAllRows(admin, "listas_opcoes"),
  ]);

  for (const [name, res] of Object.entries({ pessoas, empresas, treinamentos, equipes, equipeMembros, listasOpcoes })) {
    if (res.error) {
      return NextResponse.json({ error: `Falha ao carregar ${name}: ${res.error.message}` }, { status: 500 });
    }
  }

  const membrosPorEquipe = new Map<number, any[]>();
  for (const m of equipeMembros.data || []) {
    const list = membrosPorEquipe.get(m.equipe_id) || [];
    list.push({ pessoaId: m.pessoa_id, pessoaNome: m.pessoa_nome, cargo: m.cargo });
    membrosPorEquipe.set(m.equipe_id, list);
  }
  const equipesComMembros = (equipes.data || []).map((e) => ({
    ...e,
    membros: membrosPorEquipe.get(e.id) || [],
  }));

  const listas: Record<string, string[]> = { cargo: [], tipoPessoa: [], statusPessoa: [], projeto: [] };
  for (const opt of listasOpcoes.data || []) {
    if (!listas[opt.lista]) listas[opt.lista] = [];
    listas[opt.lista].push(opt.valor);
  }

  return NextResponse.json({
    pessoas: pessoas.data,
    empresas: empresas.data,
    treinamentos: treinamentos.data,
    equipes: equipesComMembros,
    listas,
  });
}
