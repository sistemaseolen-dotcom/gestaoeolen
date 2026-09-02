import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdmin } from "@/lib/permissions";
import type { UsuarioRow } from "@/lib/permissions";

const LISTAS_VALIDAS = ["cargo", "tipoPessoa", "statusPessoa", "projeto"] as const;
type ListaKey = (typeof LISTAS_VALIDAS)[number];

// Rótulos amigáveis por lista, usados só no log de auditoria — espelha o
// texto exibido na tela Admin > Listas do app.js antigo.
const LISTA_LABELS: Record<ListaKey, string> = {
  cargo: "Cargo (pessoas)",
  tipoPessoa: "Tipo de pessoa",
  statusPessoa: "Status (pessoas)",
  projeto: "Projeto",
};

function isListaKey(key: string): key is ListaKey {
  return (LISTAS_VALIDAS as readonly string[]).includes(key);
}

// Mudança em listas_opcoes não é um diff de coluna de uma entidade com id
// próprio (entidade_id não tem sentido real aqui) — gravamos a linha de
// audit_log diretamente, como em auditDelete/auditDiffFields.
async function auditLista(opts: {
  key: ListaKey;
  campoLabel: string;
  de: string | null;
  para: string | null;
  acao: "criar" | "editar";
  usuario: UsuarioRow | null;
}) {
  const { key, campoLabel, de, para, acao, usuario } = opts;
  const { error } = await supabaseAdmin().from("audit_log").insert({
    entidade: "lista",
    entidade_id: 0,
    entidade_label: LISTA_LABELS[key],
    acao,
    campo: "opcoes",
    campo_label: campoLabel,
    de,
    para,
    usuario_id: usuario?.id ?? null,
    usuario_nome: usuario?.nome ?? "—",
  });
  if (error) throw error;
}

export async function POST(req: Request, { params }: { params: { key: string } }) {
  if (!isListaKey(params.key)) {
    return NextResponse.json({ error: "Lista inválida." }, { status: 400 });
  }
  const key = params.key;

  // Tela Admin > Listas é admin-only no app antigo — não existe permissão
  // granular por lista, então checamos isAdmin diretamente em vez de
  // requirePermission (que exige uma Page/Action da matriz).
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAdmin(user)) return forbidden();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const valor = (body?.valor || "").toString().trim().toUpperCase();
  if (!valor) {
    return NextResponse.json({ error: "Informe o valor da opção." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("listas_opcoes")
    .insert({ lista: key, valor })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Essa opção já existe." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auditLista({
    key,
    campoLabel: "Opção adicionada",
    de: null,
    para: valor,
    acao: "criar",
    usuario: user,
  });

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: { key: string } }) {
  if (!isListaKey(params.key)) {
    return NextResponse.json({ error: "Lista inválida." }, { status: 400 });
  }
  const key = params.key;

  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAdmin(user)) return forbidden();

  // DELETE nem sempre carrega body JSON de forma confiável a partir do
  // fetch do front-end — aceitamos ?valor= na query string como alternativa.
  const { searchParams } = new URL(req.url);
  let valor = searchParams.get("valor");
  if (!valor) {
    try {
      const body = await req.json();
      valor = body?.valor ?? null;
    } catch {
      // sem body e sem query string — trata como valor ausente abaixo.
    }
  }
  valor = (valor || "").toString().trim().toUpperCase();
  if (!valor) {
    return NextResponse.json({ error: "Informe o valor da opção a remover." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Guarda: não deixa a lista ficar vazia (mesma regra do app.js antigo).
  const { count, error: countError } = await admin
    .from("listas_opcoes")
    .select("id", { count: "exact", head: true })
    .eq("lista", key);
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: "Não é possível remover a última opção da lista." }, { status: 400 });
  }

  const { error: deleteError } = await admin
    .from("listas_opcoes")
    .delete()
    .eq("lista", key)
    .eq("valor", valor);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await auditLista({
    key,
    campoLabel: "Opção removida",
    de: valor,
    para: null,
    acao: "editar",
    usuario: user,
  });

  return NextResponse.json({ ok: true });
}
