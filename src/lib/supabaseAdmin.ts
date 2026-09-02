// Cliente Supabase com a service-role key: só é usado dentro das rotas
// /api/* (servidor), NUNCA no navegador. Ele ignora RLS por completo, então
// toda checagem de permissão (canDo/canView/isAdmin) tem que acontecer em
// TypeScript, nas próprias rotas, antes de qualquer leitura/escrita — ver
// src/lib/permissions.ts e src/lib/authGuard.ts.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente."
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
