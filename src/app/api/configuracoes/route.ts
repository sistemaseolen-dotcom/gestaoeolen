import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdmin } from "@/lib/permissions";

// Configurações globais simples (chave/valor), lidas por todo mundo (o
// front-end precisa saber, por exemplo, se pode oferecer "Escolher da
// galeria" numa auditoria presencial) mas só alteráveis por admin. Espelha
// o padrão de /api/listas: sem entidade_id próprio, log direto em
// audit_log com entidade "configuracao".
const CHAVES_VALIDAS = ["auditoria_permitir_galeria_presencial", "crescimento_aprovador_id"] as const;
type ConfigChave = (typeof CHAVES_VALIDAS)[number];

const CONFIG_LABELS: Record<ConfigChave, string> = {
  auditoria_permitir_galeria_presencial: "Permitir fotos da galeria em auditorias presenciais",
  crescimento_aprovador_id: "Aprovador de crescimento",
};

// Chaves cujo valor é o id (uuid) de um usuário, não um liga/desliga --
// pedido do Diego (16/10/2026): "em administrador crie um campo para definir
// quem é o Aprovador" do Crescimento. "" = nenhum aprovador definido.
const CHAVES_USUARIO: readonly ConfigChave[] = ["crescimento_aprovador_id"];

function isConfigChave(v: string): v is ConfigChave {
  return (CHAVES_VALIDAS as readonly string[]).includes(v);
}

export async function GET() {
  const gate = await getCurrentUser();
  if (!gate) return unauthorized();

  const { data, error } = await supabaseAdmin().from("configuracoes").select("chave, valor");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map: Record<string, any> = {};
  for (const row of data || []) map[row.chave] = row.valor;
  return NextResponse.json({ configuracoes: map });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!isAdmin(user)) return forbidden();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const chave = (body?.chave || "").toString().trim();
  if (!isConfigChave(chave)) {
    return NextResponse.json({ error: "Configuração inválida." }, { status: 400 });
  }
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("configuracoes").select("valor").eq("chave", chave).maybeSingle();

  if (CHAVES_USUARIO.includes(chave)) {
    const usuarioId = typeof body?.valor === "string" ? body.valor.trim() : "";
    let usuarioNome = "";
    if (usuarioId) {
      const { data: u } = await admin.from("usuarios").select("id, nome, ativo").eq("id", usuarioId).maybeSingle();
      if (!u || !u.ativo) return NextResponse.json({ error: "Usuário não encontrado ou inativo." }, { status: 400 });
      usuarioNome = u.nome;
    }
    const { data, error } = await admin
      .from("configuracoes")
      .upsert({ chave, valor: usuarioId, atualizado_em: new Date().toISOString(), atualizado_por_nome: user.nome })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const antesId = typeof before?.valor === "string" ? before.valor : "";
    if (antesId !== usuarioId) {
      let antesNome = "";
      if (antesId) {
        const { data: ua } = await admin.from("usuarios").select("nome").eq("id", antesId).maybeSingle();
        antesNome = ua?.nome || "";
      }
      await admin.from("audit_log").insert({
        entidade: "configuracao",
        entidade_id: 0,
        entidade_label: CONFIG_LABELS[chave],
        acao: "editar",
        campo: chave,
        campo_label: CONFIG_LABELS[chave],
        de: antesNome || "Nenhum",
        para: usuarioNome || "Nenhum",
        usuario_id: user.id,
        usuario_nome: user.nome,
      });
    }
    return NextResponse.json({ chave: data.chave, valor: data.valor });
  }

  const valor = !!body?.valor;

  const { data, error } = await admin
    .from("configuracoes")
    .upsert({ chave, valor, atualizado_em: new Date().toISOString(), atualizado_por_nome: user.nome })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const deAntes = before ? !!before.valor : false;
  if (deAntes !== valor) {
    await admin.from("audit_log").insert({
      entidade: "configuracao",
      entidade_id: 0,
      entidade_label: CONFIG_LABELS[chave],
      acao: "editar",
      campo: chave,
      campo_label: CONFIG_LABELS[chave],
      de: deAntes ? "Ativado" : "Desativado",
      para: valor ? "Ativado" : "Desativado",
      usuario_id: user.id,
      usuario_nome: user.nome,
    });
  }

  return NextResponse.json({ chave: data.chave, valor: data.valor });
}
