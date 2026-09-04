import { NextResponse } from "next/server";
import { requireView } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Histórico de movimentação (status/responsável ao longo do tempo) de um
// item de patrimônio — mistura entradas espelhadas do GPO com entradas
// geradas aqui quando o status/responsável mudam por edição manual (ver
// gpoSync.ts e src/app/api/patrimonios/[id]/route.ts). Diferente do
// histórico de alterações genérico (/api/audit-log), que é por campo.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requireView("patrimonio");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("patrimonio_historico")
    .select("*")
    .eq("patrimonio_id", id)
    .order("data_evento", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data || [] });
}
