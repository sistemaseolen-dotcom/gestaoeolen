import { NextResponse } from "next/server";
import { requirePermission, requireView } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";

const STANDARDS = ["NOKIA", "ERICSSON"];
const MODALIDADES = ["PRESENCIAL", "REMOTA"];

function up(v: any): string | null {
  const s = (v ?? "").toString().trim();
  return s ? s.toUpperCase() : null;
}

// Lista "leve" (sem respostas/observação) — usada na tela de listagem.
// O detalhe completo (respostas + fotos) vem de GET /api/auditorias/[id].
export async function GET() {
  const gate = await requireView("auditorias");
  if (gate.response) return gate.response;

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("auditorias")
    .select("id, standard, site_id, empresa, data, status, inspetor_nome, num_colaboradores, criado_por_nome, criado_em, atualizado_em, finalizado_em")
    .order("data", { ascending: false })
    .order("id", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data || [] });
}

export async function POST(req: Request) {
  const gate = await requirePermission("auditorias", "criar");
  if (gate.response) return gate.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const siteId = up(body?.siteId);
  if (!siteId) {
    return NextResponse.json({ error: "Informe o Site ID." }, { status: 400 });
  }
  const standard = up(body?.standard) || "NOKIA";
  if (!STANDARDS.includes(standard)) {
    return NextResponse.json({ error: "Padrão inválido." }, { status: 400 });
  }
  const numColaboradores = Number(body?.numColaboradores) || 1;
  if (numColaboradores < 1 || numColaboradores > 3) {
    return NextResponse.json({ error: "Quantidade de colaboradores deve ser 1, 2 ou 3." }, { status: 400 });
  }
  const colaboradores = Array.isArray(body?.colaboradores)
    ? body.colaboradores.map((c: any) => up(c)).filter(Boolean)
    : [];
  let modalidade: string | null = null;
  if (body?.modalidade !== undefined && body?.modalidade !== null && body?.modalidade !== "") {
    modalidade = up(body.modalidade);
    if (!MODALIDADES.includes(modalidade || "")) {
      return NextResponse.json({ error: "Modalidade inválida." }, { status: 400 });
    }
  }

  const admin = supabaseAdmin();
  const payload = {
    legacy_id: null,
    standard,
    site_id: siteId,
    empresa: up(body?.empresa),
    data: body?.data || new Date().toISOString().slice(0, 10),
    status: "RASCUNHO",
    inspetor_nome: up(body?.inspetorNome) || gate.user?.nome || null,
    num_colaboradores: numColaboradores,
    colaboradores,
    modalidade,
    respostas: {},
    observacao_final: null,
    criado_por_id: gate.user?.id ?? null,
    criado_por_nome: gate.user?.nome ?? null,
  };

  const { data, error } = await admin.from("auditorias").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditDiffFields({
    entidade: "auditoria",
    entidadeId: data.id,
    entidadeLabel: data.site_id,
    before: null,
    after: data,
    campos: ["site_id", "empresa", "data", "standard", "status", "inspetor_nome", "num_colaboradores", "modalidade"],
    usuario: gate.user,
  });

  return NextResponse.json(data, { status: 201 });
}
