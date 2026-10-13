import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { sincronizarKmRelatorios } from "@/lib/frotasReportsSync";

// Botão "Sincronizar KM" na tela de Gestão de Frotas > Reports (pedido do
// Diego, 10/2026) -- roda na hora a mesma sincronização da tarefa agendada
// diária (ver /api/cron/sincronizar-km-relatorios), pra quem não quiser
// esperar até às 17h.
export async function POST() {
  const gate = await requirePermission("veiculos", "editar");
  if (gate.response) return gate.response;

  try {
    const resultado = await sincronizarKmRelatorios();
    return NextResponse.json(resultado);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Falha ao sincronizar os reports de KM." }, { status: 500 });
  }
}
