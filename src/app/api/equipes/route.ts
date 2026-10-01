import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";

const CAMPOS_EQUIPE = [
  "nome", "regional", "projeto", "operadora", "status", "team_lider_id", "team_lider",
] as const;

const STATUS_VALIDOS = ["ATIVO", "INATIVO"] as const;

// Lista fixa de equipamentos que toda equipe começa com, na aba "Calibração
// de equipamentos" (pedido do Diego, 01/10/2026) — por ora só estes 3; se
// precisar virar uma lista editável depois, dá pra evoluir sem quebrar o que
// já existe.
const EQUIPAMENTOS_CALIBRACAO = [
  { equipamento: "Multímetro", sort_order: 1 },
  { equipamento: "Alicate amperímetro", sort_order: 2 },
  { equipamento: "Inclinômetro", sort_order: 3 },
] as const;

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
  const nome = data?.nome ?? teamLiderFallback ?? null;
  return { team_lider_id: teamLiderId, team_lider: nome ? nome.toString().trim().toUpperCase() : nome };
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

  const nome = (body?.nome || "").toString().trim().toUpperCase();
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

  // Toda equipe nova já nasce com os 3 equipamentos de calibração
  // pendentes (sem data/status/anexo ainda) — best-effort: se isso falhar
  // por algum motivo, a equipe em si já foi criada com sucesso acima, e dá
  // pra tentar de novo depois (ex.: recriando via SQL direto no Supabase).
  const { data: calibData, error: calibError } = await supabaseAdmin()
    .from("equipe_calibracoes")
    .insert(EQUIPAMENTOS_CALIBRACAO.map((eq) => ({ equipe_id: data.id, ...eq })))
    .select();
  if (calibError) {
    console.error(`Falha ao criar calibrações iniciais da equipe ${data.id}:`, calibError.message);
  }

  // Inclui membros:[] e calibracoes:[...] para bater com o formato de
  // GET /api/state, que sempre traz a equipe já com membros/calibrações
  // carregados.
  return NextResponse.json({ ...data, membros: [], calibracoes: calibData || [] }, { status: 201 });
}
