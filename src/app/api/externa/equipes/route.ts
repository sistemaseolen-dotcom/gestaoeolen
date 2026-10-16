import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/apiTokenAuth";
import { paginacaoFromUrl, respostaPaginada } from "@/lib/externalApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// API EXTERNA (pedido do Diego, 16/10/2026) -- equipes de campo + membros,
// mesmo formato (`membros` embutido) que /api/state já devolve pro front.
export async function GET(req: Request) {
  const gate = await requireApiToken(req);
  if (gate.response) return gate.response;

  const url = new URL(req.url);
  const paginacao = paginacaoFromUrl(url);
  const admin = supabaseAdmin();

  const { data: equipes, error, count } = await admin
    .from("equipes")
    .select("*", { count: "exact" })
    .order("id")
    .range(paginacao.from, paginacao.to);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const equipeIds = (equipes || []).map((e: any) => e.id);
  const { data: membros, error: membrosError } = equipeIds.length
    ? await admin.from("equipe_membros").select("id, equipe_id, pessoa_id, pessoa_nome, cargo").in("equipe_id", equipeIds)
    : { data: [] as any[], error: null };
  if (membrosError) return NextResponse.json({ error: membrosError.message }, { status: 500 });

  const membrosPorEquipe = new Map<number, any[]>();
  for (const m of membros || []) {
    const lista = membrosPorEquipe.get(m.equipe_id) || [];
    lista.push(m);
    membrosPorEquipe.set(m.equipe_id, lista);
  }

  const dados = (equipes || []).map((e: any) => ({ ...e, membros: membrosPorEquipe.get(e.id) || [] }));
  return NextResponse.json(respostaPaginada(dados, paginacao, count));
}
