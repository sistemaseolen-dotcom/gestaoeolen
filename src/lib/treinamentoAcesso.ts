// Gate das rotas de um treinamento/documento específico (/api/treinamentos/
// [id], /arquivo, /arquivo/concluir) que também libera quem trabalha na aba
// Crescimento -- pedido do Diego (16/10/2026): a documentação obrigatória
// do crescimento (anexo, validade, status e observação de cada documento) é
// tratada DENTRO da aba Crescimento, por quem tem permissão nela, mesmo sem
// ter permissão em "documentos".
//
// Regra:
//   - Quem tem a permissão normal em "documentos" (ver/editar) -> liberado,
//     como sempre foi.
//   - Senão, só se o documento for de uma pessoa com status CRESCIMENTO e:
//       "ver":    tiver "ver" em crescimento, ou for o aprovador de
//                 crescimento (precisa conferir os anexos);
//       "editar": tiver "editar" em crescimento E o pedido já estiver
//                 APROVADO (antes disso a tratativa nem começou).
import { getCurrentUser, unauthorized, forbidden } from "./authGuard";
import { supabaseAdmin } from "./supabaseAdmin";
import { canDo } from "./permissions";
import { logAcesso } from "./accessLog";
import { isAprovadorCrescimento } from "./crescimentoAprovacao";

export async function requireTreinamentoAcesso(treinamentoId: number, action: "ver" | "editar") {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: unauthorized() } as const;

  let permitido = canDo(user, "documentos", action);
  let via = "documentos";

  if (!permitido && !Number.isNaN(treinamentoId)) {
    const admin = supabaseAdmin();
    const { data: treino } = await admin.from("treinamentos").select("pessoa_id").eq("id", treinamentoId).maybeSingle();
    if (treino) {
      const { data: pessoa } = await admin
        .from("pessoas")
        .select("status, crescimento_aprovacao_status")
        .eq("id", treino.pessoa_id)
        .maybeSingle();
      if (pessoa && pessoa.status === "CRESCIMENTO") {
        via = "crescimento";
        if (action === "ver") {
          permitido = canDo(user, "crescimento", "ver") || (await isAprovadorCrescimento(admin, user));
        } else {
          permitido = canDo(user, "crescimento", "editar") && pessoa.crescimento_aprovacao_status === "APROVADO";
        }
      }
    }
  }

  await logAcesso({
    usuarioId: user.id,
    usuarioNome: user.nome,
    usuarioEmail: user.email,
    acao: `${via}:${action}${permitido ? "" : ":negado"}`,
  });
  if (!permitido) return { user, response: forbidden() } as const;
  return { user, response: null } as const;
}
