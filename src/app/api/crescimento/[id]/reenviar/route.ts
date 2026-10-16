import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditAprovacaoCrescimento, enviarEmailSolicitacaoCrescimento } from "@/lib/crescimentoAprovacao";

// Reenviar pra aprovação um crescimento REPROVADO (pedido do Diego,
// 16/10/2026: "Reprovar com motivo, volta pro solicitante") -- depois de
// corrigir os dados pelo "Editar", quem tem permissão de editar em
// Crescimento manda de novo, voltando pra AGUARDANDO e disparando um e-mail
// novo pro aprovador.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("crescimento", "editar");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: pessoa, error: fetchError } = await admin.from("pessoas").select("*").eq("id", id).maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!pessoa) return NextResponse.json({ error: "Pessoa não encontrada." }, { status: 404 });
  if (pessoa.status !== "CRESCIMENTO") {
    return NextResponse.json({ error: "Esta pessoa não está mais em Crescimento." }, { status: 400 });
  }
  if (pessoa.crescimento_aprovacao_status !== "REPROVADO") {
    return NextResponse.json({ error: "Só dá pra reenviar um pedido que foi reprovado." }, { status: 409 });
  }

  const { data: after, error: updateError } = await admin
    .from("pessoas")
    .update({
      crescimento_aprovacao_status: "AGUARDANDO",
      crescimento_aprovacao_por_id: null,
      crescimento_aprovacao_por_nome: null,
      crescimento_aprovacao_em: null,
      // O motivo antigo continua no histórico (audit_log) -- aqui some pra
      // não confundir com um pedido novo.
      crescimento_reprovacao_motivo: null,
    })
    .eq("id", id)
    .eq("crescimento_aprovacao_status", "REPROVADO")
    .select()
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!after) return NextResponse.json({ error: "Este pedido não está mais reprovado." }, { status: 409 });

  await auditAprovacaoCrescimento(admin, after, "Reprovado", "Reenviado para aprovação", gate.user);

  const email = await enviarEmailSolicitacaoCrescimento({ admin, pessoa: after, origin: new URL(req.url).origin, reenvio: true });

  return NextResponse.json({ ...after, aviso: email.aviso });
}
