// Porta direta da lógica de permissões do app.js original (canDo/canView/
// isAdmin, PAGES, ACTIONS). Mantido 1:1 de propósito — qualquer rota nova
// deve reusar isto, nunca reimplementar a checagem na mão.

export const PAGES = ["painel", "pessoas", "equipes", "empresas", "documentos", "patrimonio"] as const;
export type Page = (typeof PAGES)[number];

export const ACTIONS = ["ver", "criar", "editar", "excluir"] as const;
export type Action = (typeof ACTIONS)[number];

export type PermissoesMatrix = Record<Page, Record<Action, boolean>>;

export interface UsuarioRow {
  id: string;
  nome: string;
  email: string;
  role: "admin" | "usuario";
  ativo: boolean;
  permissoes: PermissoesMatrix;
  must_change_password: boolean;
}

export function isAdmin(u: UsuarioRow | null | undefined): boolean {
  return !!u && u.role === "admin";
}

export function canView(u: UsuarioRow | null | undefined, page: Page): boolean {
  if (!u || !u.ativo) return false;
  if (isAdmin(u)) return true;
  return !!u.permissoes?.[page]?.ver;
}

export function canDo(u: UsuarioRow | null | undefined, page: Page, acao: Action): boolean {
  if (!u || !u.ativo) return false;
  if (isAdmin(u)) return true;
  return !!u.permissoes?.[page]?.[acao];
}

export function emptyPermissoes(): PermissoesMatrix {
  const out = {} as PermissoesMatrix;
  for (const p of PAGES) {
    out[p] = { ver: false, criar: false, editar: false, excluir: false };
  }
  return out;
}
