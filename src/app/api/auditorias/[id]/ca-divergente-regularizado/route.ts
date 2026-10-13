import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";

// Pedido do Diego (13/10/2026): botão "Marcar como resolvido" na listagem de
// Auditorias, pra toda auditoria com desvio de CA divergente (CA digitado
// pelo auditor diferente do CA da Ficha de EPI). É uma marcação OPERACIONAL
// e manual — registra que a equipe já tratou aquela pendência (ex.: EPI já
// trocado em campo, situação confirmada com o colaborador) — não mexe nos
// dados da auditoria nem da Ficha de EPI, e é independente do fluxo "Gerar
// ficha de EPI" (que corrige o CA de verdade no sistema e faz a divergência
// desaparecer sozinha, recalculada em PATCH /api/auditorias/[id]). Por isso
// o total de desvios no Painel continua o mesmo depois de marcar como
// resolvido — só passa a contar também como "regularizado".
//
// Mesmo padrão de PATCH /api/gpo-pendencias/[id] (regularizado/regularizado_em
// /regularizado_por_nome), com log em audit_log (histórico da auditoria).
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("auditorias", "editar");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: before, error: fetchError } = await admin.from("auditorias").select("*").eq("id", id).maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Auditoria não encontrada." }, { status: 404 });

  const regularizado = !!body?.regularizado;
  const patch: Record<string, any> = { ca_divergente_regularizado: regularizado };
  if (regularizado) {
    patch.ca_divergente_regularizado_em = new Date().toISOString();
    patch.ca_divergente_regularizado_por_id = gate.user?.id ?? null;
    patch.ca_divergente_regularizado_por_nome = gate.user?.nome ?? null;
  } else {
    patch.ca_divergente_regularizado_em = null;
    patch.ca_divergente_regularizado_por_id = null;
    patch.ca_divergente_regularizado_por_nome = null;
  }

  const { data: after, error: updateError } = await admin.from("auditorias").update(patch).eq("id", id).select().single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await auditDiffFields({
    entidade: "auditoria",
    entidadeId: id,
    entidadeLabel: after.site_id,
    before,
    after,
    campos: ["ca_divergente_regularizado"],
    usuario: gate.user,
  });

  return NextResponse.json(after);
}
