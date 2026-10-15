-- Migração: novos campos em Pessoas para a aba "Crescimento".
--
-- Pedido do Diego (15/10/2026): nova aba "Crescimento" — acesso restrito a
-- quem o admin conceder permissão (mesma matriz de Usuários/Permissões já
-- existente, nova página "crescimento") — para registrar pessoas entrando
-- no processo de crescimento da empresa. Ao salvar, cria um cadastro NOVO
-- em "Pessoas" com status CRESCIMENTO (status que já existia na lista
-- statusPessoa, não precisou de migração à parte) — a pessoa some da aba
-- Crescimento quando alguém muda o status dela pra ATIVO/INATIVO/BLOQUEADO
-- (ver renderCrescimentoDetail no app.js).
--
-- O formulário de Crescimento usa majoritariamente campos que já existiam
-- em "pessoas" (nome, cargo, cpf, rg, data_nascimento, email, telefone,
-- estado_atuacao, regional, projeto, operadora, coordenador, endereco,
-- numero, complemento, bairro, municipio, estado, cep, empresa_id, mei,
-- tipo_pessoa) — só estes 4 campos abaixo são realmente novos na tabela.
--
-- Como rodar: Supabase -> projeto Controle Eolen -> SQL Editor -> New query
-- -> cola tudo isso -> Run. Seguro rodar mais de uma vez.

alter table pessoas
  add column if not exists responsavel text,
  add column if not exists nome_do_pai text,
  add column if not exists nome_da_mae text,
  add column if not exists numero_contato_emergencia text;
