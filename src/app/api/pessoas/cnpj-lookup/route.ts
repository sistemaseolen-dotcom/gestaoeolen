import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/authGuard";
import { canDo } from "@/lib/permissions";
import { CnpjLookupError } from "@/lib/cnpjLookup";
import { buscarDadosEmpresaEmbutida } from "@/lib/empresaEmbutida";

// Busca de CNPJ pro formulário de Pessoas (pedido do Diego, 15/10/2026):
// cache-first em `pessoas.empresa_cnpj` -- se já existe alguém cadastrado
// com esse CNPJ, reaproveita os dados (inclusive PGR/PCMSO/contratos/tipo
// PJ, que a Receita não devolve) em vez de consultar de novo. Só bate na
// Receita quando é CNPJ realmente novo no sistema. Ver
// src/lib/empresaEmbutida.ts.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!canDo(user, "pessoas", "criar") && !canDo(user, "pessoas", "editar")) {
    return forbidden();
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  try {
    const result = await buscarDadosEmpresaEmbutida(body?.cnpj || "");
    return NextResponse.json({ empresa: result });
  } catch (err) {
    if (err instanceof CnpjLookupError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
