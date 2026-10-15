import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/authGuard";
import { canDo } from "@/lib/permissions";
import { buscarCnpj, CnpjLookupError, onlyDigitsCnpj } from "@/lib/cnpjLookup";

// Consulta de CNPJ -- lógica extraída pra src/lib/cnpjLookup.ts (15/10/2026)
// pra ser compartilhada com /api/crescimento/cnpj-lookup (mesma consulta,
// gateada por "crescimento" em vez de "empresas" -- ver aquela rota).

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  // Quem pode criar OU editar uma empresa pode buscar o CNPJ.
  if (!canDo(user, "empresas", "criar") && !canDo(user, "empresas", "editar")) {
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
