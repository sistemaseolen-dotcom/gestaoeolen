import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { auditDiffFields } from "@/lib/audit";
import { gerarApiToken } from "@/lib/apiTokenAuth";

// Gestão dos tokens da API EXTERNA (pedido do Diego, 16/10/2026) -- fica
// dentro da aba Administrador de propósito (quem pode criar/revogar um
// token que dá acesso de leitura a quase todo o sistema tem que ser admin),
// mas os TOKENS em si nunca dão acesso a nada daqui -- só aos dados
// (pessoas, equipes, patrimônio, veículos, auditorias, documentos, acesso)
// nas rotas /api/externa/*.
export async function GET() {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  // Nunca devolve token_hash (nem seria útil -- é um hash, não dá pra
  // "ver" o token de novo; o valor bruto só existe uma vez, na criação).
  const { data, error } = await supabaseAdmin()
    .from("api_tokens")
    .select("id, nome, token_prefixo, ativo, criado_em, criado_por_nome, ultimo_uso_em, observacao")
    .order("criado_em", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const nome = (body?.nome || "").toString().trim();
  if (!nome) {
    return NextResponse.json({ error: "Informe um nome pra identificar quem vai usar este token." }, { status: 400 });
  }
  const observacao = body?.observacao ? String(body.observacao).trim() : null;

  const { token, hash, prefixo } = gerarApiToken();
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("api_tokens")
    .insert({
      nome,
      token_hash: hash,
      token_prefixo: prefixo,
      observacao,
      criado_por_id: gate.user?.id ?? null,
      criado_por_nome: gate.user?.nome ?? null,
    })
    .select("id, nome, token_prefixo, ativo, criado_em, criado_por_nome, ultimo_uso_em, observacao")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditDiffFields({
    entidade: "api_token",
    entidadeId: data.id,
    entidadeLabel: data.nome,
    before: null,
    after: { nome, ativo: true, observacao },
    campos: ["nome", "ativo", "observacao"],
    usuario: gate.user,
  });

  // `token` (o valor bruto) só aparece UMA VEZ, aqui na resposta da criação
  // -- o banco só guarda o hash. Se perder, precisa gerar outro.
  return NextResponse.json({ ...data, token }, { status: 201 });
}
