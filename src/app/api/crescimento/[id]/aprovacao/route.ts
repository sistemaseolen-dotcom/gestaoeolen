import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logAcesso } from "@/lib/accessLog";
import {
  auditAprovacaoCrescimento,
  criarDocumentosObrigatoriosCrescimento,
  enviarEmailDecisaoCrescimento,
  getAprovadorCrescimentoId,
} from "@/lib/crescimentoAprovacao";

// Aprovar/Reprovar um pedido de Crescimento (pedido do Diego, 16/10/2026) --
// SÓ o aprovador definido em Administrador > Configurações pode chamar isto
// (nem admin, nem quem tem permissão em "crescimento": "o aprovador tera que
// entrar em seu usuario para realizar a aprovação"). Ver o fluxo completo em
// src/lib/crescimentoAprovacao.ts.
//
// Body: { acao: "aprovar" } ou { acao: "reprovar", motivo: "..." }
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const admin = supabaseAdmin();
  const aprovadorId = await getAprovadorCrescimentoId(admin);
  const permitido = !!aprovadorId && aprovadorId === user.id;
  await logAcesso({
    usuarioId: user.id,
    usuarioNome: user.nome,
    usuarioEmail: user.email,
    acao: `crescimento:aprovar${permitido ? "" : ":negado"}`,
  });
  if (!permitido) return forbidden("Só o aprovador de crescimento definido em Administrador pode aprovar ou reprovar.");

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  const acao = (body?.acao || "").toString();
  if (acao !== "aprovar" && acao !== "reprovar") {
    return NextResponse.json({ error: "Ação inválida. Use 'aprovar' ou 'reprovar'." }, { status: 400 });
  }
  const motivo = (body?.motivo || "").toString().trim();
  if (acao === "reprovar" && !motivo) {
    return NextResponse.json({ error: "Informe o motivo da reprovação." }, { status: 400 });
  }

  const { data: pessoa, error: fetchError } = await admin.from("pessoas").select("*").eq("id", id).maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!pessoa) return NextResponse.json({ error: "Pessoa não encontrada." }, { status: 404 });
  if (pessoa.status !== "CRESCIMENTO") {
    return NextResponse.json({ error: "Esta pessoa não está mais em Crescimento." }, { status: 400 });
  }
  if (pessoa.crescimento_aprovacao_status !== "AGUARDANDO") {
    return NextResponse.json({ error: "Este pedido não está aguardando aprovação." }, { status: 409 });
  }

  const aprovado = acao === "aprovar";
  const { data: after, error: updateError } = await admin
    .from("pessoas")
    .update({
      crescimento_aprovacao_status: aprovado ? "APROVADO" : "REPROVADO",
      crescimento_aprovacao_por_id: user.id,
      crescimento_aprovacao_por_nome: user.nome,
      crescimento_aprovacao_em: new Date().toISOString(),
      crescimento_reprovacao_motivo: aprovado ? null : motivo,
    })
    .eq("id", id)
    .eq("crescimento_aprovacao_status", "AGUARDANDO") // evita corrida com outra aba/clique duplo
    .select()
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!after) return NextResponse.json({ error: "Este pedido não está mais aguardando aprovação." }, { status: 409 });

  await auditAprovacaoCrescimento(
    admin,
    after,
    "Aguardando aprovação",
    aprovado ? "Aprovado" : `Reprovado -- motivo: ${motivo}`,
    user
  );

  // Aprovado: só agora entram os 13 documentos obrigatórios ("antes de
  // iniciar toda a tratativa das documentações esse crescimento que foi
  // solicitado deve passar por uma aprovação").
  let docsErro: string | null = null;
  if (aprovado) {
    const r = await criarDocumentosObrigatoriosCrescimento(admin, after);
    docsErro = r.error;
  }

  await enviarEmailDecisaoCrescimento({
    admin,
    pessoa: after,
    origin: new URL(req.url).origin,
    aprovado,
    motivo,
    aprovadorNome: user.nome,
  });

  if (docsErro) {
    return NextResponse.json(
      { ...after, aviso: `Aprovado, mas houve um erro ao criar os documentos obrigatórios: ${docsErro}` },
      { status: 200 }
    );
  }
  return NextResponse.json(after);
}
