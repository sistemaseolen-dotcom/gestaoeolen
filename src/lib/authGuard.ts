import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServerSession } from "./supabaseServerSession";
import { supabaseAdmin } from "./supabaseAdmin";
import { canDo, canView, isAdmin, type Action, type Page, type UsuarioRow } from "./permissions";
import { DEVICE_COOKIE } from "./deviceCookie";
import { logAcesso } from "./accessLog";

/**
 * Descobre quem está logado (via o cookie de sessão do Supabase Auth) e
 * carrega o perfil correspondente na tabela `usuarios` (role, permissoes,
 * ativo). Retorna null se não há sessão válida ou o perfil não existe/está
 * inativo — todo route handler deve tratar isso como 401.
 *
 * Verificação de dispositivo (revisão de segurança, 10/2026): a sessão do
 * Supabase Auth pode existir (cookie válido) mas ainda não contar como
 * "logada" pro resto do sistema — se o cookie de dispositivo não bater com
 * o `dispositivo_confiavel_id` salvo pro usuário, ela fica pendente até a
 * pessoa confirmar o código de 6 números (POST /api/auth/verificar-
 * dispositivo). As próprias rotas de login/verificação NÃO usam esta
 * função — elas lêem `sessionClient.auth.getUser()` direto, porque seu
 * trabalho é justamente resolver essa pendência.
 */
export async function getCurrentUser(): Promise<UsuarioRow | null> {
  const sessionClient = await supabaseServerSession();
  const {
    data: { user: authUser },
  } = await sessionClient.auth.getUser();
  if (!authUser) return null;

  const { data, error } = await supabaseAdmin()
    .from("usuarios")
    .select("id, nome, email, role, ativo, permissoes, must_change_password, dispositivo_confiavel_id")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error || !data || !data.ativo) return null;

  if (data.dispositivo_confiavel_id) {
    const cookieStore = await cookies();
    const deviceId = cookieStore.get(DEVICE_COOKIE)?.value;
    if (deviceId !== data.dispositivo_confiavel_id) return null;
  }

  return data as UsuarioRow;
}

export function unauthorized(msg = "Não autenticado.") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export function forbidden(msg = "Você não tem permissão para isso.") {
  return NextResponse.json({ error: msg }, { status: 403 });
}

/**
 * Uso típico dentro de uma rota:
 *   const gate = await requirePermission("pessoas", "editar");
 *   if (gate.response) return gate.response;
 *   const { user } = gate;
 *
 * Log técnico de acessos (pedido do Diego, 10/2026 — revisado depois a
 * pedido dele pra cobrir TODO acesso, não só alteração): toda ação que
 * passa por aqui — incluindo "ver" — grava uma linha em `log_acesso` com
 * IP, localização aproximada e dispositivo de quem fez, concedida ou
 * negada. Isso cobre as ~20 rotas de pessoas/equipes/empresas/
 * treinamentos/patrimônio/veículos/auditorias/acesso de uma vez só, sem
 * precisar tocar em cada uma. Visualizações de tela da SPA que não batem
 * no servidor (a maioria — ver #/pessoas/:id etc., que só lê dados já
 * carregados em memória) são logadas separadamente pelo front-end via
 * POST /api/log-acesso (ver renderAdminAcessos/logPageView no app.js).
 */
export async function requirePermission(page: Page, action: Action) {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: unauthorized() } as const;
  const permitido = canDo(user, page, action);
  await logAcesso({
    usuarioId: user.id,
    usuarioNome: user.nome,
    usuarioEmail: user.email,
    acao: `${page}:${action}${permitido ? "" : ":negado"}`,
  });
  if (!permitido) return { user, response: forbidden() } as const;
  return { user, response: null } as const;
}

export async function requireView(page: Page) {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: unauthorized() } as const;
  const permitido = canView(user, page);
  await logAcesso({
    usuarioId: user.id,
    usuarioNome: user.nome,
    usuarioEmail: user.email,
    acao: `${page}:ver${permitido ? "" : ":negado"}`,
  });
  if (!permitido) return { user, response: forbidden() } as const;
  return { user, response: null } as const;
}

/** Só exige estar logado e ativo (sem checar página/ação específica). */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: unauthorized() } as const;
  return { user, response: null } as const;
}

/**
 * Exige estar logado e ser administrador — usado pelas rotas de gestão de
 * usuários (que não passam por `requirePermission`, já que "usuários" não é
 * uma página da matriz de permissões) e pela leitura do log técnico de
 * acessos em si, que não deve ser visível a quem não for admin.
 */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: unauthorized() } as const;
  if (!isAdmin(user)) return { user, response: forbidden() } as const;
  return { user, response: null } as const;
}
