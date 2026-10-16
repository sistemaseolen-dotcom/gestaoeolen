import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/apiTokenAuth";
import { paginacaoFromUrl, respostaPaginada } from "@/lib/externalApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// API EXTERNA (pedido do Diego, 16/10/2026) -- auditorias de EPI.
export async function GET(req: Request) {
  const gate = await requireApiToken(req);
  if (gate.response) return gate.response;

  const url = new URL(req.url);
  const paginacao = paginacaoFromUrl(url);

  const { data, error, count } = await supabaseAdmin()
    .from("auditorias")
    .select("*", { count: "exact" })
    .order("data", { ascending: false })
    .range(paginacao.from, paginacao.to);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(respostaPaginada(data || [], paginacao, count));
}
