import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";

const CAMPOS_PATRIMONIO = ["codigo", "tipo", "modelo", "serie", "valor", "status", "responsavel_nome"] as const;
const CODIGO_REGEX = /^\d{6}$/;

function up(v: any): string | null {
  const s = (v ?? "").toString().trim();
  return s ? s.toUpperCase() : null;
}

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

  const admin = supabaseAdmin();

  const codigo = up(body?.codigo);
  const tipo = up(body?.tipo);
  if (!codigo && !tipo) {
    return NextResponse.json({ error: "Informe ao menos o patrimônio (código) ou o tipo do item." }, { status: 400 });
  }

  if (codigo) {
    if (!CODIGO_REGEX.test(codigo)) {
      return NextResponse.json({ error: "O código do patrimônio deve ter exatamente 6 dígitos." }, { status: 400 });
    }
    const { data: existente, error: existeError } = await admin
      .from("patrimonios")
      .select("id")
      .eq("codigo", codigo)
      .maybeSingle();
    if (existeError) {
      return NextResponse.json({ error: existeError.message }, { status: 500 });
    }
    if (existente) {
      return NextResponse.json({ error: `Já existe um item de patrimônio com o código ${codigo}.` }, { status: 409 });
    }
  }

  // Responsável agora é sempre selecionado a partir do cadastro de Pessoas —
  // resolvemos aqui pra guardar o id (fonte de verdade) e o nome (cache pra
  // exibição/filtro, igual ao padrão já usado em pessoas.empresa_nome).
  let responsavelPessoaId: number | null = null;
  let responsavelNome: string | null = null;
  if (body?.responsavelPessoaId !== undefined && body?.responsavelPessoaId !== null && body?.responsavelPessoaId !== "") {
    const pid = Number(body.responsavelPessoaId);
    if (Number.isNaN(pid)) {
      return NextResponse.json({ error: "Responsável inválido." }, { status: 400 });
    }
    const { data: pessoa, error: pessoaError } = await admin.from("pessoas").select("id, nome").eq("id", pid).maybeSingle();
    if (pessoaError) {
      return NextResponse.json({ error: pessoaError.message }, { status: 500 });
    }
    if (!pessoa) {
      return NextResponse.json({ error: "Pessoa responsável não encontrada." }, { status: 404 });
    }
    responsavelPessoaId = pessoa.id;
    responsavelNome = up(pessoa.nome);
  }

  const status = up(body?.status);

  const payload = {
    legacy_id: null,
    codigo,
    tipo,
    modelo: up(body?.modelo),
    serie: up(body?.serie),
    valor: parseValorInput(body?.valor),
    status,
    responsavel_pessoa_id: responsavelPessoaId,
    responsavel_nome: responsavelNome,
  };

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

  // Movimentação inicial — só registra se já nasce com status e/ou
  // responsável definidos (senão não houve "movimento" nenhum ainda).
  if (status || responsavelPessoaId) {
    await admin.from("patrimonio_historico").insert({
      patrimonio_id: data.id,
      legacy_id: null,
      status,
      responsavel_pessoa_id: responsavelPessoaId,
      responsavel_nome: responsavelNome,
      observacao: (body?.movimentacaoObservacao || "").toString().trim() || "Item criado",
      origem: "manual",
      usuario_id: gate.user?.id ?? null,
      usuario_nome: gate.user?.nome ?? "—",
    });
  }

  return NextResponse.json(data, { status: 201 });
}
