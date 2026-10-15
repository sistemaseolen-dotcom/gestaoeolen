import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/authGuard";
import { canDo } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encontrarDuplicidadePessoa } from "@/lib/pessoaDuplicidade";

// Pedido do Diego (15/10/2026): checagem ao vivo, chamada pelo formulário de
// Pessoas assim que o usuário sai do campo CPF ou Nome (antes mesmo de
// clicar em Salvar) — avisa na hora se já existe outro cadastro com aquele
// CPF ou nome. A regra que REALMENTE impede salvar é a mesma função
// (encontrarDuplicidadePessoa), chamada de novo dentro de POST /api/pessoas
// e PATCH /api/pessoas/[id] — esta rota aqui é só pra alertar cedo, nunca é
// a única linha de defesa.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  // Quem pode criar OU editar uma pessoa pode rodar esta checagem.
  if (!canDo(user, "pessoas", "criar") && !canDo(user, "pessoas", "editar")) {
    return forbidden();
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const excluirIdRaw = body?.excluirId;
  const excluirId = excluirIdRaw === null || excluirIdRaw === undefined || excluirIdRaw === "" ? null : Number(excluirIdRaw);

  const admin = supabaseAdmin();
  try {
    const resultado = await encontrarDuplicidadePessoa(admin, {
      cpf: body?.cpf,
      nome: body?.nome,
      excluirId,
    });
    return NextResponse.json(resultado);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Falha ao verificar duplicidade." }, { status: 500 });
  }
}
