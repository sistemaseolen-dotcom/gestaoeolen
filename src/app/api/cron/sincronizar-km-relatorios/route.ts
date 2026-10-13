import { NextResponse } from "next/server";
import { sincronizarKmRelatorios } from "@/lib/frotasReportsSync";

// Tarefa agendada diária às 17h (horário de Brasília) — ver "crons" em
// vercel.json ("0 20 * * *", UTC = 17h em São Paulo, que não tem horário de
// verão desde 2019). Pedido do Diego (10/2026): a Vercel, no plano atual,
// só permite 1 execução por dia por tarefa agendada -- por isso existe
// TAMBÉM o botão "Sincronizar KM" manual na tela de Reports
// (POST /api/veiculos/sincronizar-km-relatorios), pra quem precisar
// sincronizar na hora em vez de esperar o horário fixo.
//
// A Vercel chama isto com um cabeçalho `Authorization: Bearer
// <CRON_SECRET>` (variável de ambiente configurada no projeto) -- não tem
// cookie de sessão de usuário nenhum, então não passa por requirePermission
// normal. Sem o CRON_SECRET configurado corretamente, a chamada é recusada.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const resultado = await sincronizarKmRelatorios();
    return NextResponse.json(resultado);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Falha ao sincronizar os reports de KM." }, { status: 500 });
  }
}
