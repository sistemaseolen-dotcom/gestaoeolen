import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";

// "Gestão de Frotas" (pedido do Diego, 02/10/2026): contratos de locação de
// veículos — vêm do GPO a cada importação (ver /api/admin/importar-veiculos-gpo
// e syncVeiculosFromGpo em gpoSync.ts), mas também podem ser criados/editados/
// excluídos direto aqui, mesmo padrão de "patrimonio". É só dado, sem anexo
// (diferente de Documentos) — por isso não há rota de arquivo.
export const CAMPOS_VEICULO = [
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

export async function POST(req: Request) {
  // Itens criados por aqui não têm legacy_id (não vêm do GPO) — por isso
  // nunca são tocados pela importação, que só faz upsert por legacy_id.
  const gate = await requirePermission("veiculos", "criar");
  if (gate.response) return gate.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const placa = up(body?.placa);
  const contrato = txt(body?.contrato);
  if (!placa && !contrato) {
    return NextResponse.json({ error: "Informe ao menos a placa ou o contrato do veículo." }, { status: 400 });
  }

  // Vínculo opcional com uma pessoa cadastrada (igual ao responsável de
  // Patrimônio) — condutor_nome/cpf/cnh continuam editáveis livremente,
  // independente desse vínculo (o condutor do GPO nem sempre bate 1:1 com
  // uma pessoa já cadastrada aqui).
  let condutorPessoaId: number | null = null;
  if (body?.condutorPessoaId !== undefined && body?.condutorPessoaId !== null && body?.condutorPessoaId !== "") {
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
    condutorPessoaId = pessoa.id;
  }

  const payload = {
    legacy_id: null,
    contrato,
    locadora: up(body?.locadora),
    placa,
    condutor_pessoa_id: condutorPessoaId,
    condutor_nome: up(body?.condutorNome),
    cpf: txt(body?.cpf),
    cnh: txt(body?.cnh),
    status: up(body?.status),
    km_retirada: num(body?.kmRetirada),
    km_atual: num(body?.kmAtual),
    km_devolucao: num(body?.kmDevolucao),
    km_veiculo: num(body?.kmVeiculo),
    km_contrato: num(body?.kmContrato),
    km_revisao_realizada: num(body?.kmRevisaoRealizada),
    proxima_revisao_km: txt(body?.proximaRevisaoKm),
    observacao: txt(body?.observacao),
    projeto: up(body?.projeto),
    regional: up(body?.regional),
    coordenador: up(body?.coordenador),
    data_contrato: dateOrNull(body?.dataContrato),
    data_retirada: dateOrNull(body?.dataRetirada),
    data_devolucao: dateOrNull(body?.dataDevolucao),
    origem: "manual",
  };

  const { data, error } = await admin.from("veiculos").insert(payload).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auditDiffFields({
    entidade: "veiculo",
    entidadeId: data.id,
    entidadeLabel: data.placa || data.contrato || `Veículo ${data.id}`,
    before: null,
    after: data,
    campos: [...CAMPOS_VEICULO],
    usuario: gate.user,
  });

  return NextResponse.json(data, { status: 201 });
}
