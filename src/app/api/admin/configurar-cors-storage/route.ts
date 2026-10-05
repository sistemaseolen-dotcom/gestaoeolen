import { NextResponse } from "next/server";
import { requireAuth, forbidden } from "@/lib/authGuard";
import { isAdmin } from "@/lib/permissions";
import * as storage from "@/lib/magaluStorage";

// Ferramenta de uso único (admin): libera o bucket do Magalu Cloud pra
// aceitar upload direto do navegador (CORS) — necessário pro novo fluxo de
// anexos de Documentos/Treinamentos (pedido do Diego, 05/10/2026: subir até
// 40MB, bem acima do limite de 4,5MB por requisição das funções da Vercel —
// ver o comentário grande em src/app/api/treinamentos/[id]/arquivo/route.ts).
// Sem rodar isto uma vez, o navegador do usuário recebe um erro de CORS ao
// tentar mandar o arquivo direto pro Magalu.
//
// Chamar de novo é seguro (idempotente) — sempre substitui a configuração
// anterior do bucket por esta mesma. Visitar esta URL uma vez logado como
// administrador é suficiente; não precisa de botão na interface (mesmo
// padrão de /api/admin/migrar-storage-antigo).
export async function GET() {
  const gate = await requireAuth();
  if (gate.response) return gate.response;
  if (!isAdmin(gate.user)) return forbidden("Só um administrador pode rodar essa configuração.");

  const { error } = await storage.configureBucketCors();
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({
    ok: true,
    mensagem: "CORS configurado no bucket do Magalu Cloud — o upload direto do navegador já pode ser usado.",
  });
}
