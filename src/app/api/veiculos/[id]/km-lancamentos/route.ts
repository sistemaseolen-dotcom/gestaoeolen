import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { UsuarioRow } from "@/lib/permissions";

// "Histórico de Kilometragem" de um veículo — uma leitura periódica de KM
// por linha, igual à tela "Alterar Veículo" do GPO (botão "Lançar
// Kilometragem +"). Lista completa já vem embutida em cada veículo via
// /api/state (ver veiculo_km_lancamentos em src/app/api/state/route.ts) —
// esta rota só cria (POST) ou remove (DELETE, em [lancamentoId]/route.ts)
// um lançamento. Não confundir com veiculos.km_contrato (o total somado do
// CONTRATO, que continua vindo da importação única do GPO e não é afetado
// por lançamentos feitos aqui).

function fmtDateSimple(iso: string): string {
  const [y, m, d] = (iso || "").split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

async function auditKmLancamento(opts: {
  veiculoId: number;
  veiculoLabel: string;
  de: string | null;
  para: string | null;
  usuario: UsuarioRow | null;
}) {
  const { veiculoId, veiculoLabel, de, para, usuario } = opts;
  const { error } = await supabaseAdmin().from("audit_log").insert({
    entidade: "veiculo",
    entidade_id: veiculoId,
    entidade_label: veiculoLabel,
    acao: "editar",
    campo: "km_lancamento",
    campo_label: "Histórico de quilometragem",
    de,
    para,
    usuario_id: usuario?.id ?? null,
    usuario_nome: usuario?.nome ?? "—",
  });
  if (error) throw error;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("veiculos", "editar");
  if (gate.response) return gate.response;

  const veiculoId = Number(params.id);
  if (Number.isNaN(veiculoId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const data = (body?.data || "").toString().trim();
  const kmRaw = body?.km;
  const km = kmRaw !== undefined && kmRaw !== null && kmRaw !== "" ? Number(kmRaw) : null;
  if (!data) {
    return NextResponse.json({ error: "Informe a data da leitura." }, { status: 400 });
  }
  if (km === null || Number.isNaN(km)) {
    return NextResponse.json({ error: "Informe o KM da leitura." }, { status: 400 });
  }
  const responsavelNome = (body?.responsavelNome || "").toString().trim().toUpperCase() || null;

  const admin = supabaseAdmin();

  const { data: veiculo, error: veiculoError } = await admin
    .from("veiculos")
    .select("id, placa, contrato")
    .eq("id", veiculoId)
    .maybeSingle();
  if (veiculoError) return NextResponse.json({ error: veiculoError.message }, { status: 500 });
  if (!veiculo) return NextResponse.json({ error: "Veículo não encontrado." }, { status: 404 });

  const { data: lancamento, error: insertError } = await admin
    .from("veiculo_km_lancamentos")
    .insert({ veiculo_id: veiculoId, data_lancamento: data, km, responsavel_nome: responsavelNome, legacy_id: null, origem: "manual" })
    .select()
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const veiculoLabel = veiculo.placa || veiculo.contrato || `Veículo ${veiculoId}`;
  await auditKmLancamento({
    veiculoId,
    veiculoLabel,
    de: null,
    para: `${fmtDateSimple(data)} — ${km} km`,
    usuario: gate.user,
  });

  return NextResponse.json(lancamento, { status: 201 });
}
