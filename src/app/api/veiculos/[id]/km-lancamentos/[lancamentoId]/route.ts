import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function fmtDateSimple(iso: string): string {
  const [y, m, d] = (iso || "").split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string; lancamentoId: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("veiculos", "editar");
  if (gate.response) return gate.response;

  const veiculoId = Number(params.id);
  const lancamentoId = Number(params.lancamentoId);
  if (Number.isNaN(veiculoId) || Number.isNaN(lancamentoId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: veiculo, error: veiculoError } = await admin
    .from("veiculos")
    .select("id, placa, contrato")
    .eq("id", veiculoId)
    .maybeSingle();
  if (veiculoError) return NextResponse.json({ error: veiculoError.message }, { status: 500 });

  const { data: lancamento, error: fetchError } = await admin
    .from("veiculo_km_lancamentos")
    .select("*")
    .eq("id", lancamentoId)
    .eq("veiculo_id", veiculoId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!lancamento) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });

  const { error: deleteError } = await admin.from("veiculo_km_lancamentos").delete().eq("id", lancamentoId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const veiculoLabel = veiculo?.placa || veiculo?.contrato || `Veículo ${veiculoId}`;
  await supabaseAdmin().from("audit_log").insert({
    entidade: "veiculo",
    entidade_id: veiculoId,
    entidade_label: veiculoLabel,
    acao: "editar",
    campo: "km_lancamento",
    campo_label: "Histórico de quilometragem",
    de: `${fmtDateSimple(lancamento.data_lancamento)} — ${lancamento.km} km`,
    para: null,
    usuario_id: gate.user?.id ?? null,
    usuario_nome: gate.user?.nome ?? "—",
  });

  return NextResponse.json({ ok: true });
}
