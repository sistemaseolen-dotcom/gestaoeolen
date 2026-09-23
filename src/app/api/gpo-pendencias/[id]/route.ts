import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Marca (ou desmarca) uma ficha regenerada como já atualizada manualmente
// no GPO — botão "Marcar como atualizado" do indicador no Painel.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("documentos", "editar");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const regularizado = !!body?.regularizado;
  const admin = supabaseAdmin();

  const patch: Record<string, any> = { regularizado };
  if (regularizado) {
    patch.regularizado_em = new Date().toISOString();
    patch.regularizado_por_id = gate.user?.id ?? null;
    patch.regularizado_por_nome = gate.user?.nome ?? null;
  } else {
    patch.regularizado_em = null;
    patch.regularizado_por_id = null;
    patch.regularizado_por_nome = null;
  }

  const { data, error } = await admin.from("gpo_pendencias").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
