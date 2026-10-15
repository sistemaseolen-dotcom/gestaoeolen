import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/authGuard";
import { canDo } from "@/lib/permissions";
import { buscarCnpj, CnpjLookupError, onlyDigitsCnpj } from "@/lib/cnpjLookup";

// Mesma consulta de /api/empresas/cnpj-lookup (ver src/lib/cnpjLookup.ts),
// mas gateada por "crescimento" em vez de "empresas" -- pedido do Diego
// (15/10/2026): "ao digitar o CNPJ ja deve buscar todas as informações
// pertinentes daquela empresa e não buscar da lista existente, pois como é
// crescimento, se refere a uma pessoa nova". Um usuário só-"crescimento"
// (sem permissão em "empresas") precisa poder fazer essa busca também, pra
// preencher a aba "Crescimento" sem depender da lista de Empresas.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!canDo(user, "crescimento", "criar") && !canDo(user, "crescimento", "editar")) {
    return forbidden();
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  try {
    const result = await buscarCnpj(onlyDigitsCnpj(body?.cnpj || ""));
    return NextResponse.json({ empresa: result });
  } catch (err) {
    if (err instanceof CnpjLookupError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
