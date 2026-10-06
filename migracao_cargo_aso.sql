-- Migração: novo campo "Cargo ASO" em Pessoas — uma classificação
-- padronizada de cargo usada no Atestado de Saúde Ocupacional (ASO/eSocial),
-- diferente do campo "Cargo" já existente (que é o cargo operacional interno
-- da Eolen, usado inclusive pra disparar os 11 documentos obrigatórios).
--
-- Pedido do Diego (06/10/2026): adicionar "Cargo ASO" em Pessoas como um
-- campo selecionável (não de digitação livre), com estas opções (vistas por
-- ele no sistema do GPO):
--   ANTENISTA
--   AUXILIAR DE TELECOM
--   AUXILIAR TECNICO
--   INSTALADOR
--   INSTALADOR DE TELECOMUNICAÇÕES
--   INSTALADOR TECNICO
--   INSTALADOR-REPARADOR DE LINHAS E APARELHOS DE TELECOMUNICAÇÕES
--   LIDER
--   TECNICO DE TELECOM
--   TECNICO DE TELECOMUNICACOES
--   TECNICO DE VISTORIA DE TELECOM
--   TECNICO INSTALADOR
--   TECNICO LIDER
--
-- Mesmo padrão já usado pra "Cargo"/"Tipo de pessoa"/"Status"/"Projeto": uma
-- lista editável em Administrador → Listas (tabela `listas_opcoes`, chave
-- "cargoAso"), não uma lista fixa no código — assim o Diego pode adicionar
-- ou remover opções sozinho depois, sem precisar de outra alteração aqui.
--
-- Como rodar: Supabase -> projeto Controle Eolen -> SQL Editor -> New query
-- -> cola tudo isso -> Run. Seguro rodar mais de uma vez.

alter table pessoas
  add column if not exists cargo_aso text;

insert into listas_opcoes (lista, valor)
values
  ('cargoAso', 'ANTENISTA'),
  ('cargoAso', 'AUXILIAR DE TELECOM'),
  ('cargoAso', 'AUXILIAR TECNICO'),
  ('cargoAso', 'INSTALADOR'),
  ('cargoAso', 'INSTALADOR DE TELECOMUNICAÇÕES'),
  ('cargoAso', 'INSTALADOR TECNICO'),
  ('cargoAso', 'INSTALADOR-REPARADOR DE LINHAS E APARELHOS DE TELECOMUNICAÇÕES'),
  ('cargoAso', 'LIDER'),
  ('cargoAso', 'TECNICO DE TELECOM'),
  ('cargoAso', 'TECNICO DE TELECOMUNICACOES'),
  ('cargoAso', 'TECNICO DE VISTORIA DE TELECOM'),
  ('cargoAso', 'TECNICO INSTALADOR'),
  ('cargoAso', 'TECNICO LIDER')
on conflict (lista, valor) do nothing;
