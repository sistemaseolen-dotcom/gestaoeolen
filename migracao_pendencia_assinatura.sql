-- Migração: distinguir "CA divergente" (precisa corrigir o número do CA)
-- de "assinatura pendente" (o CA já foi corrigido, mas ainda com uma
-- assinatura placeholder — em branco — porque a correção foi feita direto
-- pela API antes de alguém assinar de verdade na tela).
--
-- Pedido do Diego (23/09/2026): depois que eu corrigi a Ficha de EPI do
-- Edixon direto via API (com assinatura em branco, a pedido dele), o botão
-- "Gerar ficha de EPI" e a tela de colaboradores pararam de mostrar ele —
-- porque a lógica hoje só detecta quem AINDA tem CA divergente, e o CA dele
-- já tinha sido corrigido (só faltava a assinatura de verdade). Isso separa
-- os dois estados, pra ele continuar aparecendo na mesma tela até alguém
-- realmente assinar.
--
-- Como rodar: Supabase -> projeto Controle Eolen -> SQL Editor -> New query
-- -> cola tudo isso -> Run. Seguro rodar mais de uma vez.

alter table gpo_pendencias
  add column if not exists assinatura_pendente boolean not null default false;

alter table auditorias
  add column if not exists tem_pendencia_assinatura boolean not null default false;

create index if not exists gpo_pendencias_assinatura_pendente_idx
  on gpo_pendencias (auditoria_id, regularizado, assinatura_pendente);
