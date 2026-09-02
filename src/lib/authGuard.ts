import { NextResponse } from "next/server";
import { supabaseServerSession } from "./supabaseServerSession";
import { supabaseAdmin } from "./supabaseAdmin";
import { canDo, canView, type Action, type Page, type UsuarioRow } from "./permissions";

/**
 * Descobre quem está logado (via o cookie de sessão do Supabase Auth) e
 * carrega o perfil correspondente na tabela `usuarios` (role, permissoes,
 * ativo). Retorna null se não há sessão válida ou o perfil não existe/está
 * inativo — todo route handler deve tratar isso como 401.
 */
export async function getCurrentUser(): Promise<UsuarioRow | null> {
  const sessionClient = supabaseServerSession();
  const {
    data: { user: authUser },
  } = await sessionClient.auth.getUser();
  if (!authUser) return null;

  const { data, error } = await supabaseAdmin()
    .from("usuarios")
    .select("id, nome, email, role, ativo, permissoes, must_change_password")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error || !data || !data.ativo) return null;
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
 */
export async function requirePermission(page: Page, action: Action) {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: unauthorized() } as const;
  if (!canDo(user, page, action)) return { user, response: forbidden() } as const;
  return { user, response: null } as const;
}

export async function requireView(page: Page) {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: unauthorized() } as const;
  if (!canView(user, page)) return { user, response: forbidden() } as const;
  return { user, response: null } as const;
}

/** Só exige estar logado e ativo (sem checar página/ação específica). */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: unauthorized() } as const;
  return { user, response: null } as const;
}
