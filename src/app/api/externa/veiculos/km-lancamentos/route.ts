import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/apiTokenAuth";
import { paginacaoFromUrl, respostaPaginada } from "@/lib/externalApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// API EXTERNA (pedido do Diego, 16/10/2026) -- histórico de quilometragem
// dos veículos, separado de GET /api/externa/veiculos por ser uma tabela
// bem maior (+11000 linhas). ?veiculoId= filtra por um veículo só.
export async function GET(req: Request) {
  const gate = await requireApiToken(req);
  if (gate.response) return gate.response;

  const url = new URL(req.url);
  const paginacao = paginacaoFromUrl(url);
  const veiculoId = url.searchParams.get("veiculoId");

  let query = supabaseAdmin().from("veiculo_km_lancamentos").select("*", { count: "exact" }).order("id");
  if (veiculoId) {
    const idNum = Number(veiculoId);
    if (Number.isNaN(idNum)) return NextResponse.json({ error: "veiculoId inválido." }, { status: 400 });
    query = query.eq("veiculo_id", idNum);
  }
  query = query.range(paginacao.from, paginacao.to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(respostaPaginada(data || [], paginacao, count));
}
