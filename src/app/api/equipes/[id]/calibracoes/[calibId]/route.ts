import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { UsuarioRow } from "@/lib/permissions";

// Atualizar data/status de uma calibração não é um diff de coluna de uma
// entidade própria no sentido do auditDiffFields (é uma linha de
// equipe_calibracoes, igual membros é uma linha de equipe_membros) — grava
// a linha de audit_log direto, no mesmo padrão do auditMembro em
// src/app/api/equipes/[id]/membros/route.ts.
async function auditCalibracao(opts: {
  equipeId: number;
  equipeNome: string;
  equipamento: string;
  de: string | null;
  para: string | null;
  usuario: UsuarioRow | null;
}) {
  const { equipeId, equipeNome, equipamento, de, para, usuario } = opts;
  const { error } = await supabaseAdmin().from("audit_log").insert({
    entidade: "equipe",
    entidade_id: equipeId,
    entidade_label: equipeNome,
    acao: "editar",
    campo: "calibracao",
    campo_label: `Calibração — ${equipamento}`,
    de,
    para,
    usuario_id: usuario?.id ?? null,
    usuario_nome: usuario?.nome ?? "—",
  });
  if (error) throw error;
}

function fmtDateSimple(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function resumoCalibracao(data: string | null, status: string | null): string | null {
  if (!data && !status) return null;
  const partes: string[] = [];
  if (data) partes.push(fmtDateSimple(data));
  if (status) partes.push(status);
  return partes.join(" — ") || null;
}

const STATUS_VALIDOS = ["OK", "IRREGULAR"] as const;

export async function PATCH(req: Request, context: { params: Promise<{ id: string; calibId: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("equipes", "editar");
  if (gate.response) return gate.response;

  const equipeId = Number(params.id);
  const calibId = Number(params.calibId);
  if (Number.isNaN(equipeId) || Number.isNaN(calibId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: equipe, error: equipeError } = await admin
    .from("equipes")
    .select("id, nome")
    .eq("id", equipeId)
    .maybeSingle();
  if (equipeError) return NextResponse.json({ error: equipeError.message }, { status: 500 });
  if (!equipe) return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });

  const { data: before, error: fetchError } = await admin
    .from("equipe_calibracoes")
    .select("*")
    .eq("id", calibId)
    .eq("equipe_id", equipeId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Registro de calibração não encontrado." }, { status: 404 });

  const payload: Record<string, any> = { atualizado_em: new Date().toISOString() };
  if ("dataCalibracao" in body) {
    payload.data_calibracao = body.dataCalibracao || null;
  }
  if ("status" in body) {
    const status = body.status ? String(body.status).toUpperCase() : null;
    if (status && !STATUS_VALIDOS.includes(status as (typeof STATUS_VALIDOS)[number])) {
      return NextResponse.json({ error: "Status inválido. Use OK ou IRREGULAR." }, { status: 400 });
    }
    payload.status = status;
  }

  const { data: after, error: updateError } = await admin
    .from("equipe_calibracoes")
    .update(payload)
    .eq("id", calibId)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const resumoAntes = resumoCalibracao(before.data_calibracao, before.status);
  const resumoDepois = resumoCalibracao(after.data_calibracao, after.status);
  if (resumoAntes !== resumoDepois) {
    await auditCalibracao({
      equipeId,
      equipeNome: equipe.nome,
      equipamento: before.equipamento,
      de: resumoAntes,
      para: resumoDepois,
      usuario: gate.user,
    });
  }

  return NextResponse.json(after);
}
