import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/apiTokenAuth";
import { paginacaoFromUrl, respostaPaginada, semCampos } from "@/lib/externalApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// API EXTERNA (pedido do Diego, 16/10/2026) -- equipes da aba "Acesso"
// (operadora/projeto/regional) + membros. IMPORTANTE: `acesso_membros` tem
// uma coluna `senha` (credencial de acesso ao sistema da operadora) --
// removida de cada membro aqui com `semCampos` antes de devolver, nunca
// deve sair por uma API externa.
export async function GET(req: Request) {
  const gate = await requireApiToken(req);
  if (gate.response) return gate.response;

  const url = new URL(req.url);
  const paginacao = paginacaoFromUrl(url);
  const admin = supabaseAdmin();

  const { data: equipes, error, count } = await admin
    .from("acesso_equipes")
    .select("*", { count: "exact" })
    .order("id")
    .range(paginacao.from, paginacao.to);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const equipeIds = (equipes || []).map((e: any) => e.id);
  const { data: membros, error: membrosError } = equipeIds.length
    ? await admin.from("acesso_membros").select("*").in("equipe_id", equipeIds)
    : { data: [] as any[], error: null };
  if (membrosError) return NextResponse.json({ error: membrosError.message }, { status: 500 });

  const membrosPorEquipe = new Map<number, any[]>();
  for (const m of membros || []) {
    const lista = membrosPorEquipe.get(m.equipe_id) || [];
    lista.push(semCampos(m, ["senha"]));
    membrosPorEquipe.set(m.equipe_id, lista);
  }

  const dados = (equipes || []).map((e: any) => ({ ...e, membros: membrosPorEquipe.get(e.id) || [] }));
  return NextResponse.json(respostaPaginada(dados, paginacao, count));
}
