// Cliente Supabase ligado aos cookies da requisição — usado só para saber
// QUEM está logado (via Supabase Auth), nunca para ler/escrever nas tabelas
// de negócio (isso é sempre feito pelo supabaseAdmin, que ignora RLS).
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// A partir do Next.js 16, cookies() passou a ser assíncrono (retorna uma
// Promise) — por isso esta função também precisa ser assíncrona agora, e
// todo lugar que a chama precisa usar `await`.
export async function supabaseServerSession() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // chamado a partir de um Server Component — o middleware/rota cuida disso
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // idem
        }
      },
    },
  });
}
