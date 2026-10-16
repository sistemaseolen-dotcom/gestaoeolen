import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/apiTokenAuth";
import { paginacaoFromUrl, respostaPaginada } from "@/lib/externalApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// API EXTERNA (pedido do Diego, 16/10/2026) -- treinamentos/documentos
// obrigatórios (aba "Documentos"). Tabela grande (+9000 linhas) -- sempre
// paginada. ?pessoaId= filtra por uma pessoa só.
export async function GET(req: Request) {
  const gate = await requireApiToken(req);
  if (gate.response) return gate.response;

  const url = new URL(req.url);
  const paginacao = paginacaoFromUrl(url);
  const pessoaId = url.searchParams.get("pessoaId");

  let query = supabaseAdmin().from("treinamentos").select("*", { count: "exact" }).order("id");
  if (pessoaId) {
    const idNum = Number(pessoaId);
    if (Number.isNaN(idNum)) return NextResponse.json({ error: "pessoaId inválido." }, { status: 400 });
    query = query.eq("pessoa_id", idNum);
  }
  query = query.range(paginacao.from, paginacao.to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(respostaPaginada(data || [], paginacao, count));
}
