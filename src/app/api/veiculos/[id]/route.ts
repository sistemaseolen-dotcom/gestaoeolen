import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields, auditDelete } from "@/lib/audit";

// Duplicado intencionalmente (mesmo padrão de CAMPOS_PATRIMONIO em
// patrimonios/route.ts e patrimonios/[id]/route.ts): um route.ts do App
// Router só pode exportar handlers HTTP (GET/POST/...) e algumas poucas
// configs — exportar essa constante quebra o build ("is not a valid Route
// export field"), por isso cada arquivo tem sua própria cópia.
const CAMPOS_VEICULO = [
  "placa",
  "contrato",
  "locadora",
  "status",
  "condutor_nome",
  "cpf",
  "cnh",
  "projeto",
  "regional",
  "coordenador",
  "km_retirada",
  "km_atual",
  "km_devolucao",
  "km_veiculo",
  "km_contrato",
  "km_revisao_realizada",
  "proxima_revisao_km",
  "data_contrato",
  "data_retirada",
  "data_devolucao",
  "observacao",
] as const;

function up(v: any): string | null {
  const s = (v ?? "").toString().trim();
  return s ? s.toUpperCase() : null;
}

function txt(v: any): string | null {
  const s = (v ?? "").toString().trim();
  return s || null;
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(v: any): string | null {
  const s = (v ?? "").toString().trim();
  return s || null;
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("veiculos", "editar");
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

  const { data: before, error: fetchError } = await admin.from("veiculos").select("*").eq("id", id).maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: "Veículo não encontrado." }, { status: 404 });
  }

  const patch: Record<string, any> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  if (has("placa")) patch.placa = up(body.placa);
  if (has("contrato")) patch.contrato = txt(body.contrato);
  if (has("locadora")) patch.locadora = up(body.locadora);
  if (has("status")) patch.status = up(body.status);
  if (has("condutorNome")) patch.condutor_nome = up(body.condutorNome);
  if (has("cpf")) patch.cpf = txt(body.cpf);
  if (has("cnh")) patch.cnh = txt(body.cnh);
  if (has("projeto")) patch.projeto = up(body.projeto);
  if (has("regional")) patch.regional = up(body.regional);
  if (has("coordenador")) patch.coordenador = up(body.coordenador);
  if (has("kmRetirada")) patch.km_retirada = num(body.kmRetirada);
  if (has("kmAtual")) patch.km_atual = num(body.kmAtual);
  if (has("kmDevolucao")) patch.km_devolucao = num(body.kmDevolucao);
  if (has("kmVeiculo")) patch.km_veiculo = num(body.kmVeiculo);
  if (has("kmContrato")) patch.km_contrato = num(body.kmContrato);
  if (has("kmRevisaoRealizada")) patch.km_revisao_realizada = num(body.kmRevisaoRealizada);
  if (has("proximaRevisaoKm")) patch.proxima_revisao_km = txt(body.proximaRevisaoKm);
  if (has("dataContrato")) patch.data_contrato = dateOrNull(body.dataContrato);
  if (has("dataRetirada")) patch.data_retirada = dateOrNull(body.dataRetirada);
  if (has("dataDevolucao")) patch.data_devolucao = dateOrNull(body.dataDevolucao);
  if (has("observacao")) patch.observacao = txt(body.observacao);

  if (has("condutorPessoaId")) {
    if (body.condutorPessoaId === null || body.condutorPessoaId === "" || body.condutorPessoaId === undefined) {
      patch.condutor_pessoa_id = null;
    } else {
      const pid = Number(body.condutorPessoaId);
      if (Number.isNaN(pid)) {
        return NextResponse.json({ error: "Condutor inválido." }, { status: 400 });
      }
      const { data: pessoa, error: pessoaError } = await admin.from("pessoas").select("id").eq("id", pid).maybeSingle();
      if (pessoaError) {
        return NextResponse.json({ error: pessoaError.message }, { status: 500 });
      }
      if (!pessoa) {
        return NextResponse.json({ error: "Pessoa condutora não encontrada." }, { status: 404 });
      }
      patch.condutor_pessoa_id = pessoa.id;
    }
  }

  patch.atualizado_em = new Date().toISOString();

  const { data: after, error: updateError } = await admin
    .from("veiculos")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await auditDiffFields({
    entidade: "veiculo",
    entidadeId: id,
    entidadeLabel: after.placa || after.contrato || `Veículo ${id}`,
    before,
    after,
    campos: [...CAMPOS_VEICULO],
    usuario: gate.user,
  });

  return NextResponse.json(after);
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const gate = await requirePermission("veiculos", "excluir");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: item, error: fetchError } = await admin.from("veiculos").select("*").eq("id", id).maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ error: "Veículo não encontrado." }, { status: 404 });
  }

  const { error: deleteError } = await admin.from("veiculos").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await auditDelete("veiculo", id, item.placa || item.contrato || `Veículo ${id}`, gate.user);

  return NextResponse.json({ ok: true });
}
