import { NextResponse } from "next/server";
import { requirePermission, requireView } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields, auditDelete } from "@/lib/audit";

const BUCKET = "auditorias-anexos";
const CAMPOS_AUDITORIA = [
  "site_id", "empresa", "data", "standard", "status", "inspetor_nome",
  "num_colaboradores", "observacao_final", "modalidade",
];
const MODALIDADES = ["PRESENCIAL", "REMOTA"];

function up(v: any): string | null {
  const s = (v ?? "").toString().trim();
  return s ? s.toUpperCase() : null;
}

// Detalhe completo: a auditoria + as fotos já com um link assinado (60s) pra
// cada uma, de uma vez só — evita 1 requisição por miniatura (podem ser até
// ~46 fotos numa única auditoria com 3 colaboradores).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requireView("auditorias");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: auditoria, error } = await admin.from("auditorias").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!auditoria) return NextResponse.json({ error: "Auditoria não encontrada." }, { status: 404 });

  const { data: fotos, error: fotosError } = await admin
    .from("auditoria_fotos")
    .select("id, slot_key, label, comentario, arquivo_path, sort_order")
    .eq("auditoria_id", id)
    .order("sort_order", { ascending: true });
  if (fotosError) return NextResponse.json({ error: fotosError.message }, { status: 500 });

  let fotosComUrl = fotos || [];
  if (fotosComUrl.length) {
    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrls(fotosComUrl.map((f) => f.arquivo_path), 300);
    const urlPorPath = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
    fotosComUrl = fotosComUrl.map((f) => ({ ...f, url: urlPorPath.get(f.arquivo_path) || null }));
  }

  return NextResponse.json({ ...auditoria, fotos: fotosComUrl });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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

  const patch: Record<string, any> = {};
  if (Object.prototype.hasOwnProperty.call(body, "siteId")) patch.site_id = up(body.siteId);
  if (Object.prototype.hasOwnProperty.call(body, "empresa")) patch.empresa = up(body.empresa);
  if (Object.prototype.hasOwnProperty.call(body, "data")) patch.data = body.data || null;
  if (Object.prototype.hasOwnProperty.call(body, "standard")) patch.standard = up(body.standard);
  if (Object.prototype.hasOwnProperty.call(body, "inspetorNome")) patch.inspetor_nome = up(body.inspetorNome);
  if (Object.prototype.hasOwnProperty.call(body, "numColaboradores")) {
    const n = Number(body.numColaboradores);
    if (n < 1 || n > 3) return NextResponse.json({ error: "Quantidade de colaboradores deve ser 1, 2 ou 3." }, { status: 400 });
    patch.num_colaboradores = n;
  }
  if (Object.prototype.hasOwnProperty.call(body, "colaboradores")) {
    patch.colaboradores = Array.isArray(body.colaboradores) ? body.colaboradores.map((c: any) => up(c)).filter(Boolean) : [];
  }
  if (Object.prototype.hasOwnProperty.call(body, "modalidade")) {
    const m = body.modalidade ? up(body.modalidade) : null;
    if (m && !MODALIDADES.includes(m)) {
      return NextResponse.json({ error: "Modalidade inválida." }, { status: 400 });
    }
    patch.modalidade = m;
  }
  if (Object.prototype.hasOwnProperty.call(body, "respostas")) {
    // Mescla com o que já existe — o formulário manda só as respostas que
    // mudaram desde o último carregamento, nunca precisa reenviar tudo.
    patch.respostas = { ...(before.respostas || {}), ...(body.respostas || {}) };
  }
  if (Object.prototype.hasOwnProperty.call(body, "observacaoFinal")) {
    patch.observacao_final = (body.observacaoFinal ?? "").toString().trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    const status = up(body.status);
    if (status !== "RASCUNHO" && status !== "CONCLUIDO") {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }
    patch.status = status;
    if (status === "CONCLUIDO" && before.status !== "CONCLUIDO") {
      patch.finalizado_em = new Date().toISOString();
    } else if (status === "RASCUNHO") {
      patch.finalizado_em = null;
    }
  }

  patch.atualizado_em = new Date().toISOString();

  const { data: after, error: updateError } = await admin.from("auditorias").update(patch).eq("id", id).select().single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await auditDiffFields({
    entidade: "auditoria",
    entidadeId: id,
    entidadeLabel: after.site_id,
    before,
    after,
    campos: CAMPOS_AUDITORIA,
    usuario: gate.user,
  });

  return NextResponse.json(after);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("auditorias", "excluir");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: auditoria, error: fetchError } = await admin.from("auditorias").select("id, site_id").eq("id", id).maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!auditoria) return NextResponse.json({ error: "Auditoria não encontrada." }, { status: 404 });

  const { data: fotos } = await admin.from("auditoria_fotos").select("arquivo_path").eq("auditoria_id", id);
  if (fotos && fotos.length) {
    await admin.storage.from(BUCKET).remove(fotos.map((f) => f.arquivo_path));
  }

  const { error: deleteError } = await admin.from("auditorias").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  await auditDelete("auditoria", id, auditoria.site_id, gate.user);
  return NextResponse.json({ ok: true });
}
