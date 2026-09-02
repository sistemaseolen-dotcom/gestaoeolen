import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";

const CAMPOS_EQUIPE = [
  "nome", "regional", "projeto", "operadora", "status", "team_lider_id", "team_lider",
] as const;

const STATUS_VALIDOS = ["ATIVO", "INATIVO"] as const;

// Resolve team_lider_id -> nome atual da pessoa, para manter team_lider como
// cache denormalizado (mesmo comportamento do app.js antigo, que gravava o
// nome do líder junto da equipe em vez de só o id). Se teamLiderId não for
// informado, usa o texto livre teamLider como veio no body.
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

export async function POST(req: Request) {
  const gate = await requirePermission("equipes", "criar");
  if (gate.response) return gate.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const nome = (body?.nome || "").toString().trim();
  if (!nome) {
    return NextResponse.json({ error: "Informe o nome da equipe." }, { status: 400 });
  }

  const status = (body?.status || "ATIVO").toString().trim().toUpperCase();
  if (!STATUS_VALIDOS.includes(status as (typeof STATUS_VALIDOS)[number])) {
    return NextResponse.json({ error: "Status inválido. Use ATIVO ou INATIVO." }, { status: 400 });
  }

  const { team_lider_id, team_lider } = await resolveTeamLider(body?.teamLiderId, body?.teamLider);

  const payload = {
    nome,
    regional: body?.regional ?? null,
    projeto: body?.projeto ?? null,
    operadora: body?.operadora ?? null,
    status,
    team_lider_id,
    team_lider,
  };

  const { data, error } = await supabaseAdmin().from("equipes").insert(payload).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auditDiffFields({
    entidade: "equipe",
    entidadeId: data.id,
    entidadeLabel: data.nome,
    before: null,
    after: data,
    campos: [...CAMPOS_EQUIPE],
    usuario: gate.user,
  });

  // Inclui membros:[] para bater com o formato de GET /api/state, que
  // sempre traz a equipe já com seus membros carregados.
  return NextResponse.json({ ...data, membros: [] }, { status: 201 });
}
