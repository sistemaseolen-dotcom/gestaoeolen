import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields, auditDelete } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";

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

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("patrimonio", "editar");
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

  const { data: before, error: fetchError } = await admin
    .from("patrimonios")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: "Item de patrimônio não encontrado." }, { status: 404 });
  }

  const patch: Record<string, any> = {};

  // Regra do Diego: uma vez preenchido, o código do patrimônio (6 dígitos)
  // não pode mais ser alterado nem apagado — só um administrador pode.
  if (Object.prototype.hasOwnProperty.call(body, "codigo")) {
    const novoCodigo = up(body.codigo);
    const mudou = novoCodigo !== (before.codigo || null);
    if (mudou && before.codigo) {
      if (!isAdmin(gate.user)) {
        return NextResponse.json(
          { error: "Este item já tem um código de patrimônio definido — só um administrador pode alterá-lo ou apagá-lo." },
          { status: 403 }
        );
      }
    }
    if (novoCodigo) {
      if (!CODIGO_REGEX.test(novoCodigo)) {
        return NextResponse.json({ error: "O código do patrimônio deve ter exatamente 6 dígitos." }, { status: 400 });
      }
      if (mudou) {
        const { data: existente, error: existeError } = await admin
          .from("patrimonios")
          .select("id")
          .eq("codigo", novoCodigo)
          .neq("id", id)
          .maybeSingle();
        if (existeError) {
          return NextResponse.json({ error: existeError.message }, { status: 500 });
        }
        if (existente) {
          return NextResponse.json({ error: `Já existe um item de patrimônio com o código ${novoCodigo}.` }, { status: 409 });
        }
      }
    }
    patch.codigo = novoCodigo;
  }

  if (Object.prototype.hasOwnProperty.call(body, "tipo")) patch.tipo = up(body.tipo);
  if (Object.prototype.hasOwnProperty.call(body, "modelo")) patch.modelo = up(body.modelo);
  if (Object.prototype.hasOwnProperty.call(body, "serie")) patch.serie = up(body.serie);
  if (Object.prototype.hasOwnProperty.call(body, "valor")) patch.valor = parseValorInput(body.valor);
  if (Object.prototype.hasOwnProperty.call(body, "status")) patch.status = up(body.status);

  let responsavelMudou = false;
  if (Object.prototype.hasOwnProperty.call(body, "responsavelPessoaId")) {
    if (body.responsavelPessoaId === null || body.responsavelPessoaId === "" || body.responsavelPessoaId === undefined) {
      patch.responsavel_pessoa_id = null;
      patch.responsavel_nome = null;
    } else {
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
      patch.responsavel_pessoa_id = pessoa.id;
      patch.responsavel_nome = up(pessoa.nome);
    }
    responsavelMudou = patch.responsavel_pessoa_id !== (before.responsavel_pessoa_id ?? null);
  }

  patch.atualizado_em = new Date().toISOString();

  const { data: after, error: updateError } = await admin
    .from("patrimonios")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await auditDiffFields({
    entidade: "patrimonio",
    entidadeId: id,
    entidadeLabel: after.codigo || after.tipo || `Item ${id}`,
    before,
    after,
    campos: [...CAMPOS_PATRIMONIO],
    usuario: gate.user,
  });

  // Histórico de movimentação: só registra uma entrada nova quando o que
  // realmente caracteriza um "movimento" muda (status e/ou responsável) —
  // edição de outros campos (modelo, série, valor...) já fica registrada no
  // histórico de alterações genérico (audit_log) via auditDiffFields acima.
  const statusMudou = Object.prototype.hasOwnProperty.call(patch, "status") && patch.status !== (before.status || null);
  if (statusMudou || responsavelMudou) {
    await admin.from("patrimonio_historico").insert({
      patrimonio_id: id,
      legacy_id: null,
      status: after.status,
      responsavel_pessoa_id: after.responsavel_pessoa_id,
      responsavel_nome: after.responsavel_nome,
      observacao: (body?.movimentacaoObservacao || "").toString().trim() || null,
      origem: "manual",
      usuario_id: gate.user?.id ?? null,
      usuario_nome: gate.user?.nome ?? "—",
    });
  }

  return NextResponse.json(after);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("patrimonio", "excluir");
  if (gate.response) return gate.response;

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: item, error: fetchError } = await admin
    .from("patrimonios")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ error: "Item de patrimônio não encontrado." }, { status: 404 });
  }

  // Mesma regra do código: um item que já tem patrimônio definido carrega
  // histórico de verdade — só um administrador pode excluí-lo.
  if (item.codigo && !isAdmin(gate.user)) {
    return NextResponse.json(
      { error: "Este item já tem um código de patrimônio definido — só um administrador pode excluí-lo." },
      { status: 403 }
    );
  }

  const { error: deleteError } = await admin.from("patrimonios").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Aviso: se este item veio do GPO (legacy_id preenchido) e continuar
  // existindo lá, a próxima sincronização o recria aqui (upsert por
  // legacy_id) — a exclusão só "gruda" para itens só locais ou também
  // removidos no GPO. patrimonio_historico é removido em cascata (FK on
  // delete cascade).
  await auditDelete("patrimonio", id, item.codigo || item.tipo || `Item ${id}`, gate.user);

  return NextResponse.json({ ok: true });
}
