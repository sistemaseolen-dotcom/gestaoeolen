import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";

const CAMPOS_PATRIMONIO = ["codigo", "tipo", "modelo", "serie", "valor", "status", "responsavel_nome"] as const;

function parseValorInput(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  // Itens criados por aqui não têm legacy_id (não vêm do GPO) — por isso
  // nunca são tocados pela sincronização, que só faz upsert por legacy_id.
  const gate = await requirePermission("patrimonio", "criar");
  if (gate.response) return gate.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const codigo = (body?.codigo || "").toString().trim();
  const tipo = (body?.tipo || "").toString().trim();
  if (!codigo && !tipo) {
    return NextResponse.json({ error: "Informe ao menos o código ou o tipo do item." }, { status: 400 });
  }

  const payload = {
    legacy_id: null,
    codigo: codigo || null,
    tipo: tipo || null,
    modelo: (body?.modelo || "").toString().trim() || null,
    serie: (body?.serie || "").toString().trim() || null,
    valor: parseValorInput(body?.valor),
    status: (body?.status || "").toString().trim() || null,
    responsavel_nome: (body?.responsavelNome || "").toString().trim() || null,
  };

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("patrimonios").insert(payload).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auditDiffFields({
    entidade: "patrimonio",
    entidadeId: data.id,
    entidadeLabel: data.codigo || data.tipo || `Item ${data.id}`,
    before: null,
    after: data,
    campos: [...CAMPOS_PATRIMONIO],
    usuario: gate.user,
  });

  return NextResponse.json(data, { status: 201 });
}
