import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";
import { ACESSO_PROJETOS, ACESSO_REGIONAIS, filtrarLista, validarOperadora } from "@/lib/acesso";

const CAMPOS_ACESSO_EQUIPE = [
  "nome_equipe", "operadora", "projetos", "regionais", "atividade", "empresa", "status", "validade", "contrato",
] as const;

export async function POST(req: Request) {
  const gate = await requirePermission("acesso", "criar");
  if (gate.response) return gate.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const nomeEquipe = (body?.nomeEquipe || "").toString().trim();
  if (!nomeEquipe) {
    return NextResponse.json({ error: "Informe o nome da equipe." }, { status: 400 });
  }

  const operadora = validarOperadora(body?.operadora);
  if (!operadora) {
    return NextResponse.json({ error: "Operadora inválida. Use TIM, CLARO ou VIVO." }, { status: 400 });
  }

  const payload = {
    nome_equipe: nomeEquipe,
    operadora,
    projetos: filtrarLista(body?.projetos, ACESSO_PROJETOS),
    regionais: filtrarLista(body?.regionais, ACESSO_REGIONAIS),
    atividade: body?.atividade ? String(body.atividade).trim() : null,
    empresa: body?.empresa ? String(body.empresa).trim().toUpperCase() : null,
    status: body?.status ? String(body.status).trim().toUpperCase() : null,
    validade: body?.validade || null,
    contrato: body?.contrato ? String(body.contrato).trim() : null,
  };

  const { data, error } = await supabaseAdmin().from("acesso_equipes").insert(payload).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auditDiffFields({
    entidade: "acesso_equipe",
    entidadeId: data.id,
    entidadeLabel: data.nome_equipe,
    before: null,
    after: data,
    campos: [...CAMPOS_ACESSO_EQUIPE],
    usuario: gate.user,
  });

  // Inclui membros:[] pra bater com o formato de GET /api/state, que sempre
  // traz a equipe já com seus membros carregados.
  return NextResponse.json({ ...data, membros: [] }, { status: 201 });
}
