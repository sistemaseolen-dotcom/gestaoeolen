import { NextResponse } from "next/server";
import { requireAuth, forbidden } from "@/lib/authGuard";
import { isAdmin } from "@/lib/permissions";
import { upsertVeiculosFromGpo } from "@/lib/gpoSync";

// Ferramenta de uso único/ocasional (admin) — "Gestão de Frotas > Veículos"
// (pedido do Diego, 02/10/2026). Ver o comentário grande acima de
// upsertVeiculosFromGpo() em src/lib/gpoSync.ts pra entender por que é o
// NAVEGADOR (não este servidor) que busca os dados no GPO: o endpoint
// /v1/veiculosnovo é lento demais (minutos) pra caber nos 60s da função
// serverless, mas não tem restrição de CORS — então o front-end (tela de
// Sincronização) busca cada status direto no GPO e só manda os registros já
// prontos pra cá, pra um upsert rápido por legacy_id.
export const maxDuration = 60;

export async function POST(req: Request) {
  const gate = await requireAuth();
  if (gate.response) return gate.response;
  if (!isAdmin(gate.user)) return forbidden("Só um administrador pode rodar essa importação.");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const registros = body?.registros;
  if (!Array.isArray(registros)) {
    return NextResponse.json({ error: "Nenhum registro enviado." }, { status: 400 });
  }

  try {
    const resumo = await upsertVeiculosFromGpo(registros);
    return NextResponse.json({ status: body?.status || null, ...resumo });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
