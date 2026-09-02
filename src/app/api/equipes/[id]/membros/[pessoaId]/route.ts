import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { UsuarioRow } from "@/lib/permissions";

// Mesmo padrão de audit_log direto usado em membros/route.ts (POST) — não
// dá pra usar auditDiffFields porque a mudança não é um diff de coluna.
async function auditMembro(opts: {
  equipeId: number;
  equipeNome: string;
  de: string | null;
  para: string | null;
  usuario: UsuarioRow | null;
}) {
  const { equipeId, equipeNome, de, para, usuario } = opts;
  const { error } = await supabaseAdmin().from("audit_log").insert({
    entidade: "equipe",
    entidade_id: equipeId,
    entidade_label: equipeNome,
    acao: "editar",
    campo: "membros",
    campo_label: "Membros",
    de,
    para,
    usuario_id: usuario?.id ?? null,
    usuario_nome: usuario?.nome ?? "—",
  });
  if (error) throw error;
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; pessoaId: string } }
) {
  const gate = await requirePermission("equipes", "editar");
  if (gate.response) return gate.response;

  const equipeId = Number(params.id);
  const pessoaId = Number(params.pessoaId);
  if (Number.isNaN(equipeId) || Number.isNaN(pessoaId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: equipe, error: equipeError } = await admin
    .from("equipes")
    .select("id, nome")
    .eq("id", equipeId)
    .maybeSingle();
  if (equipeError) {
    return NextResponse.json({ error: equipeError.message }, { status: 500 });
  }
  if (!equipe) {
    return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });
  }

  const { data: membro, error: membroError } = await admin
    .from("equipe_membros")
    .select("*")
    .eq("equipe_id", equipeId)
    .eq("pessoa_id", pessoaId)
    .maybeSingle();
  if (membroError) {
    return NextResponse.json({ error: membroError.message }, { status: 500 });
  }
  if (!membro) {
    return NextResponse.json({ error: "Membro não encontrado nesta equipe." }, { status: 404 });
  }

  const { error: deleteError } = await admin
    .from("equipe_membros")
    .delete()
    .eq("equipe_id", equipeId)
    .eq("pessoa_id", pessoaId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await auditMembro({
    equipeId,
    equipeNome: equipe.nome,
    de: `${membro.pessoa_nome}${membro.cargo ? ` (${membro.cargo})` : ""}`,
    para: null,
    usuario: gate.user,
  });

  return NextResponse.json({ ok: true });
}
