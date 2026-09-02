import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields, auditDelete } from "@/lib/audit";

const CAMPOS_EQUIPE = [
  "nome", "regional", "projeto", "operadora", "status", "team_lider_id", "team_lider",
] as const;

const STATUS_VALIDOS = ["ATIVO", "INATIVO"] as const;

// Mesma lógica de resolução de team_lider_id -> nome usada no POST de
// /api/equipes (duplicada de propósito, seguindo o padrão já usado em
// empresaTitle() nas rotas de empresas — cada route.ts fica autossuficiente).
async function resolveTeamLider(
  teamLiderIdRaw: any,
  teamLiderFallback: any
): Promise<{ team_lider_id: number | null; team_lider: string | null }> {
  if (teamLiderIdRaw === null || teamLiderIdRaw === undefined || teamLiderIdRaw === "") {
    return {
      team_lider_id: null,
      team_lider: teamLiderFallback === undefined ? null : (teamLiderFallback || null),
    };
  }
  const teamLiderId = Number(teamLiderIdRaw);
  if (Number.isNaN(teamLiderId)) {
    return { team_lider_id: null, team_lider: teamLiderFallback || null };
  }
  const { data } = await supabaseAdmin().from("pessoas").select("nome").eq("id", teamLiderId).maybeSingle();
  return { team_lider_id: teamLiderId, team_lider: data?.nome ?? teamLiderFallback ?? null };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("equipes", "editar");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: before, error: fetchError } = await admin.from("equipes").select("*").eq("id", id).maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });
  }

  const patch: Record<string, any> = {};

  if (Object.prototype.hasOwnProperty.call(body, "nome")) {
    const nome = (body.nome || "").toString().trim();
    if (!nome) {
      return NextResponse.json({ error: "Informe o nome da equipe." }, { status: 400 });
    }
    patch.nome = nome;
  }
  if (Object.prototype.hasOwnProperty.call(body, "regional")) patch.regional = body.regional ?? null;
  if (Object.prototype.hasOwnProperty.call(body, "projeto")) patch.projeto = body.projeto ?? null;
  if (Object.prototype.hasOwnProperty.call(body, "operadora")) patch.operadora = body.operadora ?? null;
  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    const status = (body.status || "").toString().trim().toUpperCase();
    if (!STATUS_VALIDOS.includes(status as (typeof STATUS_VALIDOS)[number])) {
      return NextResponse.json({ error: "Status inválido. Use ATIVO ou INATIVO." }, { status: 400 });
    }
    patch.status = status;
  }
  // teamLiderId e teamLider aplicam-se juntos, pois team_lider é um cache do
  // nome de team_lider_id — só recalcula se algum dos dois veio no body.
  if (
    Object.prototype.hasOwnProperty.call(body, "teamLiderId") ||
    Object.prototype.hasOwnProperty.call(body, "teamLider")
  ) {
    const teamLiderIdRaw = Object.prototype.hasOwnProperty.call(body, "teamLiderId")
      ? body.teamLiderId
      : before.team_lider_id;
    const teamLiderFallback = Object.prototype.hasOwnProperty.call(body, "teamLider")
      ? body.teamLider
      : before.team_lider;
    const { team_lider_id, team_lider } = await resolveTeamLider(teamLiderIdRaw, teamLiderFallback);
    patch.team_lider_id = team_lider_id;
    patch.team_lider = team_lider;
  }

  const { data: after, error: updateError } = await admin
    .from("equipes")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await auditDiffFields({
    entidade: "equipe",
    entidadeId: id,
    entidadeLabel: after.nome,
    before,
    after,
    campos: [...CAMPOS_EQUIPE],
    usuario: gate.user,
  });

  return NextResponse.json(after);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("equipes", "excluir");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: equipe, error: fetchError } = await admin.from("equipes").select("*").eq("id", id).maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!equipe) {
    return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });
  }

  // equipe_membros tem FK ON DELETE CASCADE para equipe_id — não precisa
  // apagar os membros manualmente aqui.
  const { error: deleteError } = await admin.from("equipes").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await auditDelete("equipe", id, equipe.nome, gate.user);

  return NextResponse.json({ ok: true });
}
