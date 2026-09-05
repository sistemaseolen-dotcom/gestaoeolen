import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdmin } from "@/lib/permissions";

// Configurações globais simples (chave/valor), lidas por todo mundo (o
// front-end precisa saber, por exemplo, se pode oferecer "Escolher da
// galeria" numa auditoria presencial) mas só alteráveis por admin. Espelha
// o padrão de /api/listas: sem entidade_id próprio, log direto em
// audit_log com entidade "configuracao".
const CHAVES_VALIDAS = ["auditoria_permitir_galeria_presencial"] as const;
type ConfigChave = (typeof CHAVES_VALIDAS)[number];

const CONFIG_LABELS: Record<ConfigChave, string> = {
  auditoria_permitir_galeria_presencial: "Permitir fotos da galeria em auditorias presenciais",
};

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
  const valor = !!body?.valor;

  const admin = supabaseAdmin();
  const { data: before } = await admin.from("configuracoes").select("valor").eq("chave", chave).maybeSingle();

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
