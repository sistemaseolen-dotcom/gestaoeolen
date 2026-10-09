import { NextResponse } from "next/server";
import { supabaseServerSession } from "@/lib/supabaseServerSession";
import { getCurrentUser } from "@/lib/authGuard";
import { logAcesso } from "@/lib/accessLog";

export async function POST() {
  // Lê quem está logado ANTES de encerrar a sessão — depois do signOut não
  // tem mais como saber quem era.
  const user = await getCurrentUser();
  const sessionClient = await supabaseServerSession();
  await sessionClient.auth.signOut();
  if (user) {
    await logAcesso({ usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email, acao: "logout" });
  }
  return NextResponse.json({ ok: true });
}
