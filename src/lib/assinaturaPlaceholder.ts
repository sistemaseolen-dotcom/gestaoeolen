// Marcador usado quando uma Ficha de EPI é regenerada SEM assinatura real
// ainda — um PNG 1x1 totalmente transparente. Só existe pra dar suporte a um
// caso pontual (pedido do Diego, 23/09/2026): corrigir o CA de um item direto
// via chamada de API, antes de alguém efetivamente assinar na tela, sem
// deixar nenhuma marca visível na célula de assinatura da ficha gerada.
//
// Toda vez que POST /api/auditorias/[id]/gerar-ficha-epi recebe esse valor
// em TODOS os itens (em vez de um traço real desenhado no canvas), marca a
// pendência (`gpo_pendencias.assinatura_pendente`) e a auditoria
// (`auditorias.tem_pendencia_assinatura`) como "ainda precisa de assinatura
// de verdade" — ver comentário em cima da rota POST e em
// divergencias-epi/route.ts. Isso é o que faz o colaborador continuar
// aparecendo na tela "Gerar ficha de EPI", junto com quem realmente tem CA
// divergente, até alguém assinar pra valer.
export const ASSINATURA_PLACEHOLDER_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
