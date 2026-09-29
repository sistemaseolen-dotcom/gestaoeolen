-- ============================================================
-- Carga inicial da aba "Acesso" — pedido do Diego (29/09/2026)
-- ============================================================
-- Importa APENAS as linhas realmente preenchidas da planilha
-- "importação padronizada VIVO/TIM/CLARO/NOKIA" enviada pelo Diego
-- (1103 linhas de modelo no arquivo, mas só 64 linhas tinham dados —
-- as vazias foram ignoradas, conforme pedido: "pegue essas e não as
-- vazias"). Essas 64 linhas formam 14 equipes distintas, todas
-- TIM / NOKIA / Regional CO (duas equipes também atuam em NO),
-- empresa EOLEN.
--
-- ATENÇÃO — achado na planilha original, não é erro desta importação:
-- as colunas "IHS" e "WINITY" de TODAS as 64 linhas não contêm
-- credenciais desses sistemas — contêm, respectivamente, uma repetição
-- de telefone/e-mail e de nome+CPF (ex.: IHS = "(11) 9xxxx-xxxx/
-- email@...", WINITY = "NOME COMPLETO;CPF"). Importamos literalmente
-- o que estava na planilha (não inventamos nem descartamos dado do
-- Diego), mas ele deve confirmar se isso é: (a) erro de preenchimento
-- de quem fez a planilha (nesse caso, o certo é limpar os campos IHS/
-- WINITY dessas 64 pessoas pela própria tela de Acesso depois de
-- migrar), ou (b) informação válida de algum outro sistema com esse
-- nome. Nenhuma outra coluna de credencial (REDECORP, SIGITM, SENHA,
-- VA ACCESS, IMEI, ATC-VIVO, HIGHLINE-VIVO, OE, TELEFONE VIVO, E-MAIL
-- CORPORATIVO, FILIAÇÃO, VEÍCULO, CNPJ, PIS, SAP, STATUS, VALIDADE,
-- CONTRATO) tinha qualquer valor preenchido nessas 64 linhas — ficam
-- NULL aqui, pra completar depois pela tela.
--
-- Rode isto DEPOIS de aplicar migracao_acesso_equipes.sql (cria as
-- tabelas). Pode rodar de novo sem duplicar: cada bloco de equipe só
-- insere se ainda não existir uma equipe com esse nome exato.
-- ============================================================

-- ---- Equipe: GILMARIO (CO | INSTALAÇÃO - MANUTENÇÃO) (6 integrante(s)) ----
INSERT INTO acesso_equipes (nome_equipe, operadora, projetos, regionais, atividade, empresa)
SELECT 'GILMARIO (CO | INSTALAÇÃO - MANUTENÇÃO)', 'TIM', ARRAY['NOKIA']::text[], ARRAY['CO']::text[], 'INSTALAÇÃO - MANUTENÇÃO', 'EOLEN'
WHERE NOT EXISTS (SELECT 1 FROM acesso_equipes WHERE nome_equipe = 'GILMARIO (CO | INSTALAÇÃO - MANUTENÇÃO)');
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'LEANDRO', 'RICARDO DOS SANTOS ANDRADE', '39.725.039-3', '472.304.998-36', '1996-12-12'::date, '(55) 99204-5460', 'leandroricardo00977@gmail.com', '(55) 99204-5460/leandroricardo00977@gmail.com', 'LEANDRO RICARDO DOS SANTOS ANDRADE;472.304.998-36'
FROM acesso_equipes e
WHERE e.nome_equipe = 'GILMARIO (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'LEANDRO' AND am.sobrenome = 'RICARDO DOS SANTOS ANDRADE' AND am.cpf = '472.304.998-36'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LEADER', 'GILMARIO', 'OLIVEIRA ANDRADE', '36457577', '325.780.358-30', '1984-11-30'::date, '(11) 95965-5573', 'jbinstalacoes78@gmail.com', '(11) 95965-5573/jbinstalacoes78@gmail.com', 'GILMARIO OLIVEIRA ANDRADE;325.780.358-30'
FROM acesso_equipes e
WHERE e.nome_equipe = 'GILMARIO (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'GILMARIO' AND am.sobrenome = 'OLIVEIRA ANDRADE' AND am.cpf = '325.780.358-30'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'CAIQUE', 'SOUZA BENTO', '49.118.730-0', '348.040.008-60', '1993-03-03'::date, '(11) 98639-0069', 'caiquebento93@outlook.com', '(11) 98639-0069/caiquebento93@outlook.com', 'CAIQUE SOUZA BENTO;348.040.008-60'
FROM acesso_equipes e
WHERE e.nome_equipe = 'GILMARIO (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'CAIQUE' AND am.sobrenome = 'SOUZA BENTO' AND am.cpf = '348.040.008-60'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'LUAN', 'NOGUEIRA DOS SANTOS', '37.818.068-X', '473.782.428-37', '1999-05-10'::date, '(11) 94440-1651', 'lluannogueiradossantos@gmail.com', '(11) 94440-1651/lluannogueiradossantos@gmail.com', 'LUAN NOGUEIRA DOS SANTOS;473.782.428-37'
FROM acesso_equipes e
WHERE e.nome_equipe = 'GILMARIO (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'LUAN' AND am.sobrenome = 'NOGUEIRA DOS SANTOS' AND am.cpf = '473.782.428-37'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'BRENDO', 'CORREIA LOPES', '47.845.019-9', '444.040.808-75', '1995-04-19'::date, '(11) 91500-0257', 'Ibrendocorreia@gmail.com', '(11) 91500-0257/Ibrendocorreia@gmail.com', 'BRENDO CORREIA LOPES;444.040.808-75'
FROM acesso_equipes e
WHERE e.nome_equipe = 'GILMARIO (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'BRENDO' AND am.sobrenome = 'CORREIA LOPES' AND am.cpf = '444.040.808-75'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LEADER', 'FERNANDO', 'SANTOS DE MATOS', '41491242', '367.885.868-61', '1986-11-07'::date, '(11) 9557-12120', 'Zop.feh32@gmail.com', '(11) 9557-12120/Zop.feh32@gmail.com', 'FERNANDO SANTOS DE MATOS;367.885.868-61'
FROM acesso_equipes e
WHERE e.nome_equipe = 'GILMARIO (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'FERNANDO' AND am.sobrenome = 'SANTOS DE MATOS' AND am.cpf = '367.885.868-61'
  );

-- ---- Equipe: JICLEI (CO | INSTALAÇÃO - MANUTENÇÃO) (3 integrante(s)) ----
INSERT INTO acesso_equipes (nome_equipe, operadora, projetos, regionais, atividade, empresa)
SELECT 'JICLEI (CO | INSTALAÇÃO - MANUTENÇÃO)', 'TIM', ARRAY['NOKIA']::text[], ARRAY['CO']::text[], 'INSTALAÇÃO - MANUTENÇÃO', 'EOLEN'
WHERE NOT EXISTS (SELECT 1 FROM acesso_equipes WHERE nome_equipe = 'JICLEI (CO | INSTALAÇÃO - MANUTENÇÃO)');
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LEADER', 'JICLEI', 'OLIVEIRA DE ANDRADE', '39.087.022-5', '917.630.965-72', '1977-08-20'::date, '(11) 94474-2930', 'jicleijessica@hotmail.com', '(11) 94474-2930/jicleijessica@hotmail.com', 'JICLEI OLIVEIRA DE ANDRADE;917.630.965-72'
FROM acesso_equipes e
WHERE e.nome_equipe = 'JICLEI (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'JICLEI' AND am.sobrenome = 'OLIVEIRA DE ANDRADE' AND am.cpf = '917.630.965-72'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'DEIVID', 'FERREIRA AQUINO', '55.496.388-7', '241.801.768-07', '2003-10-15'::date, '(11) 99376-3128', 'ferreiradeivid762@gmail.com', '(11) 99376-3128/ferreiradeivid762@gmail.com', 'DEIVID FERREIRA AQUINO;241.801.768-07'
FROM acesso_equipes e
WHERE e.nome_equipe = 'JICLEI (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'DEIVID' AND am.sobrenome = 'FERREIRA AQUINO' AND am.cpf = '241.801.768-07'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'FELIPE', 'SILVA SOUZA', '42.848.123-1', '415.570.338-62', '1993-09-16'::date, '(11) 95369-9129', 'felipeefw5712@gmail.com', '(11) 95369-9129/felipeefw5712@gmail.com', 'FELIPE SILVA SOUZA;415.570.338-62'
FROM acesso_equipes e
WHERE e.nome_equipe = 'JICLEI (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'FELIPE' AND am.sobrenome = 'SILVA SOUZA' AND am.cpf = '415.570.338-62'
  );

-- ---- Equipe: FERMIN (CO | INSTALAÇÃO - MANUTENÇÃO) (2 integrante(s)) ----
INSERT INTO acesso_equipes (nome_equipe, operadora, projetos, regionais, atividade, empresa)
SELECT 'FERMIN (CO | INSTALAÇÃO - MANUTENÇÃO)', 'TIM', ARRAY['NOKIA']::text[], ARRAY['CO']::text[], 'INSTALAÇÃO - MANUTENÇÃO', 'EOLEN'
WHERE NOT EXISTS (SELECT 1 FROM acesso_equipes WHERE nome_equipe = 'FERMIN (CO | INSTALAÇÃO - MANUTENÇÃO)');
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LEADER', 'WILLYS', 'ALEXANDER LOPEZ URBAEZ', 'F702954-L', '241.496.998-95', '1984-01-13'::date, '(32) 99164-2122', 'willysalexander.servico@outlook.com', '(32) 99164-2122/willysalexander.servico@outlook.com', 'WILLYS ALEXANDER LOPEZ URBAEZ;241.496.998-95'
FROM acesso_equipes e
WHERE e.nome_equipe = 'FERMIN (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'WILLYS' AND am.sobrenome = 'ALEXANDER LOPEZ URBAEZ' AND am.cpf = '241.496.998-95'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'JESUS', 'ANTÔNIO GONZALEZ CHIRINOS', 'RNMB216108R', '241.472.698-93', '1980-07-03'::date, '(11) 95685-7207', 'jesusantoniogonzalezchirino99@gmail.com', '(11) 95685-7207/jesusantoniogonzalezchirino99@gmail.com', 'JESUS ANTÔNIO GONZALEZ CHIRINOS;241.472.698-93'
FROM acesso_equipes e
WHERE e.nome_equipe = 'FERMIN (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'JESUS' AND am.sobrenome = 'ANTÔNIO GONZALEZ CHIRINOS' AND am.cpf = '241.472.698-93'
  );

-- ---- Equipe: FERMIN (CO | NO | INSTALAÇÃO - MANUTENÇÃO) (3 integrante(s)) ----
INSERT INTO acesso_equipes (nome_equipe, operadora, projetos, regionais, atividade, empresa)
SELECT 'FERMIN (CO | NO | INSTALAÇÃO - MANUTENÇÃO)', 'TIM', ARRAY['NOKIA']::text[], ARRAY['CO','NO']::text[], 'INSTALAÇÃO - MANUTENÇÃO', 'EOLEN'
WHERE NOT EXISTS (SELECT 1 FROM acesso_equipes WHERE nome_equipe = 'FERMIN (CO | NO | INSTALAÇÃO - MANUTENÇÃO)');
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LEADER', 'LUIS', 'ESTEBAN FERMIN BERMUDEZ', 'RNM G4685007', '241.380.668-70', '1984-03-19'::date, '(12)  98144-1477', 'luisferminbermudez@gmail.com', '(12) 98144-1477/luisferminbermudez@gmail.com', 'LUIS ESTEBAN FERMIN BERMUDEZ;241.380.668-70'
FROM acesso_equipes e
WHERE e.nome_equipe = 'FERMIN (CO | NO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'LUIS' AND am.sobrenome = 'ESTEBAN FERMIN BERMUDEZ' AND am.cpf = '241.380.668-70'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'DOUGLAS', 'STEVENS GREGORIO', 'B655307B', '121.372.592-57', '2002-01-26'::date, '(95) 98117-0623', 'stevenromeros000@gmail.com', '(95) 98117-0623/stevenromeros000@gmail.com', 'DOUGLAS STEVENS GREGORIO;121.372.592-57'
FROM acesso_equipes e
WHERE e.nome_equipe = 'FERMIN (CO | NO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'DOUGLAS' AND am.sobrenome = 'STEVENS GREGORIO' AND am.cpf = '121.372.592-57'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'BRYAN', 'STEVEN ROMERO DIAZ', 'B6553356', '121.373.012-02', '2007-06-21'::date, '(95)  98418-2665', 'bryanstevenromerodiaz@gmail.com', '(95) 98418-2665/bryanstevenromerodiaz@gmail.com', 'BRYAN STEVEN ROMERO DIAZ;121.373.012-02'
FROM acesso_equipes e
WHERE e.nome_equipe = 'FERMIN (CO | NO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'BRYAN' AND am.sobrenome = 'STEVEN ROMERO DIAZ' AND am.cpf = '121.373.012-02'
  );

-- ---- Equipe: JOSÉ PAIXÃO (CO | INSTALAÇÃO - MANUTENÇÃO) (2 integrante(s)) ----
INSERT INTO acesso_equipes (nome_equipe, operadora, projetos, regionais, atividade, empresa)
SELECT 'JOSÉ PAIXÃO (CO | INSTALAÇÃO - MANUTENÇÃO)', 'TIM', ARRAY['NOKIA']::text[], ARRAY['CO']::text[], 'INSTALAÇÃO - MANUTENÇÃO', 'EOLEN'
WHERE NOT EXISTS (SELECT 1 FROM acesso_equipes WHERE nome_equipe = 'JOSÉ PAIXÃO (CO | INSTALAÇÃO - MANUTENÇÃO)');
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LEADER', 'JOSE', 'PAIXÃO ALVES DA CRUZ', '30265294', '259.151.588-38', '1975-03-28'::date, '(31) 97146-4279', 'josepaixaoalves975@gmail.com', '(31) 97146-4279/josepaixaoalves975@gmail.com', 'JOSE PAIXÃO ALVES DA CRUZ;259.151.588-38'
FROM acesso_equipes e
WHERE e.nome_equipe = 'JOSÉ PAIXÃO (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'JOSE' AND am.sobrenome = 'PAIXÃO ALVES DA CRUZ' AND am.cpf = '259.151.588-38'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'LUCAS', 'FELIPE DE CARVALHO MAGALHAES', 'MG18690188', '019.420.626-21', '1998-01-20'::date, '(31) 97146-4279', 'lucasfelipe.dn@gmail.com', '(31) 97146-4279/lucasfelipe.dn@gmail.com', 'LUCAS FELIPE DE CARVALHO MAGALHAES;019.420.626-21'
FROM acesso_equipes e
WHERE e.nome_equipe = 'JOSÉ PAIXÃO (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'LUCAS' AND am.sobrenome = 'FELIPE DE CARVALHO MAGALHAES' AND am.cpf = '019.420.626-21'
  );

-- ---- Equipe: WILLIAN (CO | INSTALAÇÃO - MANUTENÇÃO) (3 integrante(s)) ----
INSERT INTO acesso_equipes (nome_equipe, operadora, projetos, regionais, atividade, empresa)
SELECT 'WILLIAN (CO | INSTALAÇÃO - MANUTENÇÃO)', 'TIM', ARRAY['NOKIA']::text[], ARRAY['CO']::text[], 'INSTALAÇÃO - MANUTENÇÃO', 'EOLEN'
WHERE NOT EXISTS (SELECT 1 FROM acesso_equipes WHERE nome_equipe = 'WILLIAN (CO | INSTALAÇÃO - MANUTENÇÃO)');
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LEADER', 'WILLIAN', 'ANDERSON DOS SANTOS SANTANA', '21.330.679-49', '079.056.585-46', '1997-07-19'::date, '(11) 95064-4513', 'andersenwillian484@gmail.com', '(11) 95064-4513/andersenwillian484@gmail.com', 'WILLIAN ANDERSON DOS SANTOS SANTANA;079.056.585-46'
FROM acesso_equipes e
WHERE e.nome_equipe = 'WILLIAN (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'WILLIAN' AND am.sobrenome = 'ANDERSON DOS SANTOS SANTANA' AND am.cpf = '079.056.585-46'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'BRENO', 'MATOS OLIVEIRA', '23.238.932-20', '110.931.875-81', '2001-03-18'::date, '(11) 91571-4553', 'matosbreno168@gmail.com', '(11) 91571-4553/matosbreno168@gmail.com', 'BRENO MATOS OLIVEIRA;110.931.875-81'
FROM acesso_equipes e
WHERE e.nome_equipe = 'WILLIAN (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'BRENO' AND am.sobrenome = 'MATOS OLIVEIRA' AND am.cpf = '110.931.875-81'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'KAYQUE', 'OLIVEIRA PAULINO', '506921402', '545.368.388-05', '2005-10-12'::date, '(11) 94587-6883', 'okayke981@gmail.com', '(11) 94587-6883/okayke981@gmail.com', 'KAYQUE OLIVEIRA PAULINO;545.368.388-05'
FROM acesso_equipes e
WHERE e.nome_equipe = 'WILLIAN (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'KAYQUE' AND am.sobrenome = 'OLIVEIRA PAULINO' AND am.cpf = '545.368.388-05'
  );

-- ---- Equipe: CLT (CO | NO | INSTALAÇÃO - MANUTENÇÃO) (2 integrante(s)) ----
INSERT INTO acesso_equipes (nome_equipe, operadora, projetos, regionais, atividade, empresa)
SELECT 'CLT (CO | NO | INSTALAÇÃO - MANUTENÇÃO)', 'TIM', ARRAY['NOKIA']::text[], ARRAY['CO','NO']::text[], 'INSTALAÇÃO - MANUTENÇÃO', 'EOLEN'
WHERE NOT EXISTS (SELECT 1 FROM acesso_equipes WHERE nome_equipe = 'CLT (CO | NO | INSTALAÇÃO - MANUTENÇÃO)');
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LEADER', 'DOUGLAS', 'RAMOS', '3057344', '065.763.121-30', '1997-07-19'::date, '(61) 99107-6802', 'douglasramos1633@gmail.com', '(61) 99107-6802/douglasramos1633@gmail.com', 'DOUGLAS RAMOS;065.763.121-30'
FROM acesso_equipes e
WHERE e.nome_equipe = 'CLT (CO | NO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'DOUGLAS' AND am.sobrenome = 'RAMOS' AND am.cpf = '065.763.121-30'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'MATEUS', 'SOARES DE ARAUJO', '6894072', '708.684.781-05', '2000-07-30'::date, '(61) 99439-3118', 'coeolen158@gmail.com', '(61) 99439-3118/coeolen158@gmail.com', 'MATEUS SOARES DE ARAUJO;708.684.781-05'
FROM acesso_equipes e
WHERE e.nome_equipe = 'CLT (CO | NO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'MATEUS' AND am.sobrenome = 'SOARES DE ARAUJO' AND am.cpf = '708.684.781-05'
  );

-- ---- Equipe: JOHNATHAN (CO | INSTALAÇÃO - MANUTENÇÃO) (2 integrante(s)) ----
INSERT INTO acesso_equipes (nome_equipe, operadora, projetos, regionais, atividade, empresa)
SELECT 'JOHNATHAN (CO | INSTALAÇÃO - MANUTENÇÃO)', 'TIM', ARRAY['NOKIA']::text[], ARRAY['CO']::text[], 'INSTALAÇÃO - MANUTENÇÃO', 'EOLEN'
WHERE NOT EXISTS (SELECT 1 FROM acesso_equipes WHERE nome_equipe = 'JOHNATHAN (CO | INSTALAÇÃO - MANUTENÇÃO)');
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LEADER', 'JOHNATHAN', 'DE SOUZA REIS', '50.545.40', '038.272.511-50', '1993-07-27'::date, '(62) 99173-8770', 'Jhoanathanreis@outlook.com', '(62) 99173-8770/Jhoanathanreis@outlook.com', 'JOHNATHAN DE SOUZA REIS;038.272.511-50'
FROM acesso_equipes e
WHERE e.nome_equipe = 'JOHNATHAN (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'JOHNATHAN' AND am.sobrenome = 'DE SOUZA REIS' AND am.cpf = '038.272.511-50'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'FABIO', 'FERNANDES COSTA BRITO', '6303708', '703.741.451-48', '1998-07-02'::date, '(62) 99834-6013', 'fabioadventistadia7@gmail.com', '(62) 99834-6013/fabioadventistadia7@gmail.com', 'FABIO FERNANDES COSTA BRITO;703.741.451-48'
FROM acesso_equipes e
WHERE e.nome_equipe = 'JOHNATHAN (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'FABIO' AND am.sobrenome = 'FERNANDES COSTA BRITO' AND am.cpf = '703.741.451-48'
  );

-- ---- Equipe: ANTONIO MARCOS (CO | INSTALAÇÃO - MANUTENÇÃO) (2 integrante(s)) ----
INSERT INTO acesso_equipes (nome_equipe, operadora, projetos, regionais, atividade, empresa)
SELECT 'ANTONIO MARCOS (CO | INSTALAÇÃO - MANUTENÇÃO)', 'TIM', ARRAY['NOKIA']::text[], ARRAY['CO']::text[], 'INSTALAÇÃO - MANUTENÇÃO', 'EOLEN'
WHERE NOT EXISTS (SELECT 1 FROM acesso_equipes WHERE nome_equipe = 'ANTONIO MARCOS (CO | INSTALAÇÃO - MANUTENÇÃO)');
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LEADER', 'ANTÔNIO', 'MARCOS FARIAS DA SILVA', '5114825', '434.881.414-7', '1992-08-07'::date, '(61) 99568-6365', 'antoniojc268@gmail.com', '(61) 99568-6365/antoniojc268@gmail.com', 'ANTÔNIO MARCOS FARIAS DA SILVA;434.881.414-7'
FROM acesso_equipes e
WHERE e.nome_equipe = 'ANTONIO MARCOS (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'ANTÔNIO' AND am.sobrenome = 'MARCOS FARIAS DA SILVA' AND am.cpf = '434.881.414-7'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'TALISSON', 'DE SOUSA BARBOSA', '3459747', '701.300.551-74', '1996-08-14'::date, '(61) 99524-5912', 'talissomdesousa567@gmail.com', '(61) 99524-5912/talissomdesousa567@gmail.com', 'TALISSON DE SOUSA BARBOSA;701.300.551-74'
FROM acesso_equipes e
WHERE e.nome_equipe = 'ANTONIO MARCOS (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'TALISSON' AND am.sobrenome = 'DE SOUSA BARBOSA' AND am.cpf = '701.300.551-74'
  );

-- ---- Equipe: MARCELO (CO | INSTALAÇÃO - MANUTENÇÃO) (2 integrante(s)) ----
INSERT INTO acesso_equipes (nome_equipe, operadora, projetos, regionais, atividade, empresa)
SELECT 'MARCELO (CO | INSTALAÇÃO - MANUTENÇÃO)', 'TIM', ARRAY['NOKIA']::text[], ARRAY['CO']::text[], 'INSTALAÇÃO - MANUTENÇÃO', 'EOLEN'
WHERE NOT EXISTS (SELECT 1 FROM acesso_equipes WHERE nome_equipe = 'MARCELO (CO | INSTALAÇÃO - MANUTENÇÃO)');
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LEADER', 'MARCELO', 'ARAÚJO DA SILVA', '3890083', '702.922.951-70', '1998-03-03'::date, '(62) 98300-8609', 'Marcello21.araujo@gmail.com', '(62) 98300-8609/Marcello21.araujo@gmail.com', 'MARCELO ARAÚJO DA SILVA;702.922.951-70'
FROM acesso_equipes e
WHERE e.nome_equipe = 'MARCELO (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'MARCELO' AND am.sobrenome = 'ARAÚJO DA SILVA' AND am.cpf = '702.922.951-70'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'SIDNEY', 'BARBOSA MARTINS', '6448746', '705.118.211-07', '1998-02-25'::date, '(61) 99602-9096', 'Sidneybmocara@gmail.com', '(61) 99602-9096/Sidneybmocara@gmail.com', 'SIDNEY BARBOSA MARTINS;705.118.211-07'
FROM acesso_equipes e
WHERE e.nome_equipe = 'MARCELO (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'SIDNEY' AND am.sobrenome = 'BARBOSA MARTINS' AND am.cpf = '705.118.211-07'
  );

-- ---- Equipe: FERNANDO (CO | INSTALAÇÃO - MANUTENÇÃO) (3 integrante(s)) ----
INSERT INTO acesso_equipes (nome_equipe, operadora, projetos, regionais, atividade, empresa)
SELECT 'FERNANDO (CO | INSTALAÇÃO - MANUTENÇÃO)', 'TIM', ARRAY['NOKIA']::text[], ARRAY['CO']::text[], 'INSTALAÇÃO - MANUTENÇÃO', 'EOLEN'
WHERE NOT EXISTS (SELECT 1 FROM acesso_equipes WHERE nome_equipe = 'FERNANDO (CO | INSTALAÇÃO - MANUTENÇÃO)');
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LEADER', 'FERNANDO', 'DA SILVA MAIA', '2203056', '008.671.431-77', '1984-10-22'::date, '(61) 98478-3018', 'furmiga_102@hotmail.com', '(61) 98478-3018/furmiga_102@hotmail.com', 'FERNANDO DA SILVA MAIA;008.671.431-77'
FROM acesso_equipes e
WHERE e.nome_equipe = 'FERNANDO (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'FERNANDO' AND am.sobrenome = 'DA SILVA MAIA' AND am.cpf = '008.671.431-77'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'RIVELINO', 'RIBEIRO DOS SANTOS', '2142734', '797.711.147-00', '1983-07-31'::date, '(61) 99872-2805', 'ribeirodossantosrivelino@gmail.com', '(61) 99872-2805/ribeirodossantosrivelino@gmail.com', 'RIVELINO RIBEIRO DOS SANTOS;797.711.147-00'
FROM acesso_equipes e
WHERE e.nome_equipe = 'FERNANDO (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'RIVELINO' AND am.sobrenome = 'RIBEIRO DOS SANTOS' AND am.cpf = '797.711.147-00'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'JOSÉ', 'WUILIAM CAMPOS BRAGA', '2195368', '134.130.715-8', '1985-06-13'::date, '(61) 99612-0835', 'wiliamcampos25@gmail.com', '(61) 99612-0835/wiliamcampos25@gmail.com', 'JOSÉ WUILIAM CAMPOS BRAGA;134.130.715-8'
FROM acesso_equipes e
WHERE e.nome_equipe = 'FERNANDO (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'JOSÉ' AND am.sobrenome = 'WUILIAM CAMPOS BRAGA' AND am.cpf = '134.130.715-8'
  );

-- ---- Equipe: LEANDRO SOARES (CO | INSTALAÇÃO - MANUTENÇÃO) (3 integrante(s)) ----
INSERT INTO acesso_equipes (nome_equipe, operadora, projetos, regionais, atividade, empresa)
SELECT 'LEANDRO SOARES (CO | INSTALAÇÃO - MANUTENÇÃO)', 'TIM', ARRAY['NOKIA']::text[], ARRAY['CO']::text[], 'INSTALAÇÃO - MANUTENÇÃO', 'EOLEN'
WHERE NOT EXISTS (SELECT 1 FROM acesso_equipes WHERE nome_equipe = 'LEANDRO SOARES (CO | INSTALAÇÃO - MANUTENÇÃO)');
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LEADER', 'LEANDRO', 'DE SOUZA SOARES', '419356927', '347.578.918-30', '1986-03-05'::date, '(11) 97396-1813', 'lesouza006@hotmail.com', '(11) 97396-1813/lesouza006@hotmail.com', 'LEANDRO DE SOUZA SOARES;347.578.918-30'
FROM acesso_equipes e
WHERE e.nome_equipe = 'LEANDRO SOARES (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'LEANDRO' AND am.sobrenome = 'DE SOUZA SOARES' AND am.cpf = '347.578.918-30'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'FRANCISCO', 'ARTHUR RODRIGUES DE SOUSA', '60383528 SSP', '105.906.984-94', '1994-12-04'::date, '(19) 99861-9352', 'arthursousasousa65@gmail.com', '(19) 99861-9352/arthursousasousa65@gmail.com', 'FRANCISCO ARTHUR RODRIGUES DE SOUSA;105.906.984-94'
FROM acesso_equipes e
WHERE e.nome_equipe = 'LEANDRO SOARES (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'FRANCISCO' AND am.sobrenome = 'ARTHUR RODRIGUES DE SOUSA' AND am.cpf = '105.906.984-94'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'MURILO', 'PINHEIRO DA SILVA', '48.974.334-1', '437.008.168-80', '1993-05-16'::date, '(11) 91257-9404', 'murillopinheiro1605@gmail.com', '(11) 91257-9404/murillopinheiro1605@gmail.com', 'MURILO PINHEIRO DA SILVA;437.008.168-80'
FROM acesso_equipes e
WHERE e.nome_equipe = 'LEANDRO SOARES (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'MURILO' AND am.sobrenome = 'PINHEIRO DA SILVA' AND am.cpf = '437.008.168-80'
  );

-- ---- Equipe: WALLYSON (CO | INSTALAÇÃO - MANUTENÇÃO) (3 integrante(s)) ----
INSERT INTO acesso_equipes (nome_equipe, operadora, projetos, regionais, atividade, empresa)
SELECT 'WALLYSON (CO | INSTALAÇÃO - MANUTENÇÃO)', 'TIM', ARRAY['NOKIA']::text[], ARRAY['CO']::text[], 'INSTALAÇÃO - MANUTENÇÃO', 'EOLEN'
WHERE NOT EXISTS (SELECT 1 FROM acesso_equipes WHERE nome_equipe = 'WALLYSON (CO | INSTALAÇÃO - MANUTENÇÃO)');
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LEADER', 'WALLYSON', 'DA SILVA BRUNAR', '470034026', '449.848.448.76', '1996-04-16'::date, '(14) 99680-9511', 'wallysonlukasmiguell@gmail.com', '(14) 99680-9511/wallysonlukasmiguell@gmail.com', 'WALLYSON DA SILVA BRUNAR;449.848.448.76'
FROM acesso_equipes e
WHERE e.nome_equipe = 'WALLYSON (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'WALLYSON' AND am.sobrenome = 'DA SILVA BRUNAR' AND am.cpf = '449.848.448.76'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'KAUE', 'ALVES MARÇAL', '46982534-0', '465.546.608-10', '1996-12-24'::date, '(14) 99908-5730', 'Kauemarcal47@gmail.com', '(14) 99908-5730/Kauemarcal47@gmail.com', 'KAUE ALVES MARÇAL;465.546.608-10'
FROM acesso_equipes e
WHERE e.nome_equipe = 'WALLYSON (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'KAUE' AND am.sobrenome = 'ALVES MARÇAL' AND am.cpf = '465.546.608-10'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'CAUÊ', 'RODRIGUES GIMÉNEZ MACEDO', '460086583', '455.925.328-57', '1996-03-08'::date, '(14) 99810-1542', 'caue.rodrigues08@hotmail.com', '(14) 99810-1542/caue.rodrigues08@hotmail.com', 'CAUÊ RODRIGUES GIMÉNEZ MACEDO;455.925.328-57'
FROM acesso_equipes e
WHERE e.nome_equipe = 'WALLYSON (CO | INSTALAÇÃO - MANUTENÇÃO)'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'CAUÊ' AND am.sobrenome = 'RODRIGUES GIMÉNEZ MACEDO' AND am.cpf = '455.925.328-57'
  );

-- ---- Equipe: NO| INSTALAÇÃO - MANUTENÇÃO (28 integrante(s)) ----
INSERT INTO acesso_equipes (nome_equipe, operadora, projetos, regionais, atividade, empresa)
SELECT 'NO| INSTALAÇÃO - MANUTENÇÃO', 'TIM', ARRAY['NOKIA']::text[], ARRAY['NO']::text[], 'INSTALAÇÃO - MANUTENÇÃO', 'EOLEN'
WHERE NOT EXISTS (SELECT 1 FROM acesso_equipes WHERE nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO');
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LIDER', 'TOMAZ EDSON', 'DA SILVA', '306743153', '215.530.748-90', '1979-08-03'::date, '(86) 99918-0288', 'tomaz.edson15@gmail.com', '(86) 99918-0288/tomaz.edson15@gmail.com', 'TOMAZ EDSON DA SILVA;215.530.748-90'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'TOMAZ EDSON' AND am.sobrenome = 'DA SILVA' AND am.cpf = '215.530.748-90'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'JOSE VINICIUS', 'OLIVEIRA SILVA', '4303959', '047.077.973-00', '1999-05-05'::date, '(86) 98839-5694', 'joseviniciusalves2525@gmail.com', '(86) 98839-5694/joseviniciusalves2525@gmail.com', 'JOSE VINICIUS OLIVEIRA SILVA;047.077.973-00'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'JOSE VINICIUS' AND am.sobrenome = 'OLIVEIRA SILVA' AND am.cpf = '047.077.973-00'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'LEANDRO DA', 'SILVA OLIVEIRA', '2132784', '024.395.993-10', '1982-02-21'::date, '(86) 99472-2190', 'l67706797@gmail.com', '(86) 99472-2190/l67706797@gmail.com', 'LEANDRO DA SILVA OLIVEIRA;024.395.993-10'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'LEANDRO DA' AND am.sobrenome = 'SILVA OLIVEIRA' AND am.cpf = '024.395.993-10'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LIDER', 'ADRIANO APARECIDO', 'FULINI GIMENES', '44.236.837-9', '358.539.048-09', '1988-06-16'::date, '(11) 96144-0775', 'adriano.asplus@hotmail.com', '(11) 96144-0775/adriano.asplus@hotmail.com', 'ADRIANO APARECIDO FULINI GIMENES;358.539.048-09'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'ADRIANO APARECIDO' AND am.sobrenome = 'FULINI GIMENES' AND am.cpf = '358.539.048-09'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'ITALO BRUNO', 'RODRIGUES DOS SANTOS', '64159744-7', '117.003.777-10', '1987-03-25'::date, '(11) 99967-5029', 'ibrscomunicacoes@gmail.com', '(11) 99967-5029/ibrscomunicacoes@gmail.com', 'ITALO BRUNO RODRIGUES DOS SANTOS;117.003.777-10'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'ITALO BRUNO' AND am.sobrenome = 'RODRIGUES DOS SANTOS' AND am.cpf = '117.003.777-10'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LIDER', 'FRANCISCO DICKSON', 'DE OLIVEIRA', '52802685', '915.062.472-53', '1983-06-17'::date, '(11) 95155-0839', 'franciscodickson.oliveira@yahoo.com', '(11) 95155-0839/franciscodickson.oliveira@yahoo.com', 'FRANCISCO DICKSON DE OLIVEIRA;915.062.472-53'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'FRANCISCO DICKSON' AND am.sobrenome = 'DE OLIVEIRA' AND am.cpf = '915.062.472-53'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'AUGUSTO CEZAR', 'GOMES DE ALMEIDA', '37572652', '099.363.472-93', '2005-02-12'::date, '(92) 9323-5938', 'nevesneves33157@gmail.com', '(92) 9323-5938/nevesneves33157@gmail.com', 'AUGUSTO CEZAR GOMES DE ALMEIDA;099.363.472-93'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'AUGUSTO CEZAR' AND am.sobrenome = 'GOMES DE ALMEIDA' AND am.cpf = '099.363.472-93'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LIDER', 'THIERRY DE', 'PAULA DUTRA', '234729234', '164.685.857-32', '1997-06-07'::date, '(21) 98090-2997', 'thierrydutra47@gmail.com', '(21) 98090-2997/thierrydutra47@gmail.com', 'THIERRY DE PAULA DUTRA;164.685.857-32'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'THIERRY DE' AND am.sobrenome = 'PAULA DUTRA' AND am.cpf = '164.685.857-32'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'JORGE LUIS DE', 'CARVALHO SIMÕES', '284194115', '064.008.837-62', '1997-09-16'::date, '(21) 97459-5848', 'jorgesimoes531@gmail.com', '(21) 97459-5848/jorgesimoes531@gmail.com', 'JORGE LUIS DE CARVALHO SIMÕES;064.008.837-62'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'JORGE LUIS DE' AND am.sobrenome = 'CARVALHO SIMÕES' AND am.cpf = '064.008.837-62'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LIDER', 'DARWIN ORDOÑEZ', 'CASTRO', 'B413032Z', '119.516.488-20', '1996-03-10'::date, '(51) 98905-2489', 'darwin100396@gmail.com', '(51) 98905-2489/darwin100396@gmail.com', 'DARWIN ORDOÑEZ CASTRO;119.516.488-20'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'DARWIN ORDOÑEZ' AND am.sobrenome = 'CASTRO' AND am.cpf = '119.516.488-20'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'SANTOS MANUEL', 'LEZAMA MARCANO', 'RNMF879822S', '710.429.322-12', '1991-10-03'::date, '(11) 94558-3599', 'ezamamarcanosantosmanuel@gmail.com', '(11) 94558-3599/ezamamarcanosantosmanuel@gmail.com', 'SANTOS MANUEL LEZAMA MARCANO;710.429.322-12'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'SANTOS MANUEL' AND am.sobrenome = 'LEZAMA MARCANO' AND am.cpf = '710.429.322-12'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LIDER', 'JESUS RAFAEL', 'ROSALES GARCIA', 'B085025-8', '111.478.662-44', '1993-04-01'::date, '(11) 99422-0696', 'ingrosalesjr@gmail.com', '(11) 99422-0696/ingrosalesjr@gmail.com', 'JESUS RAFAEL ROSALES GARCIA;111.478.662-44'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'JESUS RAFAEL' AND am.sobrenome = 'ROSALES GARCIA' AND am.cpf = '111.478.662-44'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'GEOVANNY', 'FRANCISCO ECHEVERRÍA MENDOZA', 'B439042R', '117.842.892-30', '1992-07-16'::date, '(51) 99745-2681', 'geovannnye@gmail.com', '(51) 99745-2681/geovannnye@gmail.com', 'GEOVANNY FRANCISCO ECHEVERRÍA MENDOZA;117.842.892-30'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'GEOVANNY' AND am.sobrenome = 'FRANCISCO ECHEVERRÍA MENDOZA' AND am.cpf = '117.842.892-30'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LIDER', 'LUCAS SANTOS', 'PINTO', '060056982016-1', '619.225.253-08', '1999-08-03'::date, '(98) 98497-7248', 'santoslpnext22@gmail.com', '(98) 98497-7248/santoslpnext22@gmail.com', 'LUCAS SANTOS PINTO;619.225.253-08'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'LUCAS SANTOS' AND am.sobrenome = 'PINTO' AND am.cpf = '619.225.253-08'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'JUVENILSON', 'AGUIAR PIMENTEL', '036547483-50', '036.547.483-50', '1981-07-28'::date, '(98) 98466-4559', 'juvenilson.aguiar@rsitelecom.com.br', '(98) 98466-4559/juvenilson.aguiar@rsitelecom.com.br', 'JUVENILSON AGUIAR PIMENTEL;036.547.483-50'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'JUVENILSON' AND am.sobrenome = 'AGUIAR PIMENTEL' AND am.cpf = '036.547.483-50'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'LUIS FERNANDO', 'SANTOS FERREIRA', '17737720018', '605.451.623-00', '1993-11-14'::date, '(98) 8532-5447', 'fenandocosta73@gmail.com', '(98) 8532-5447/fenandocosta73@gmail.com', 'LUIS FERNANDO SANTOS FERREIRA;605.451.623-00'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'LUIS FERNANDO' AND am.sobrenome = 'SANTOS FERREIRA' AND am.cpf = '605.451.623-00'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LIDER', 'MARCOS PAULO', 'DE LIMA', '60584833369', '605.848.333-69', '1996-04-05'::date, '(98) 98461-1975', 'mp0676589@gmail.com', '(98) 98461-1975/mp0676589@gmail.com', 'MARCOS PAULO SANTOS DE LIMA;605.848.333-69'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'MARCOS PAULO' AND am.sobrenome = 'DE LIMA' AND am.cpf = '605.848.333-69'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'JOSE ERICSON', 'RIBEIRO DA SILVA', '378488020095', '104.901.014-02', '1992-05-16'::date, '(98) 98477-4537', 'ericsonribeirodasilva@gmail.com', '(98) 98477-4537/ericsonribeirodasilva@gmail.com', 'JOSE ERICSON RIBEIRO DA SILVA;104.901.014-02'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'JOSE ERICSON' AND am.sobrenome = 'RIBEIRO DA SILVA' AND am.cpf = '104.901.014-02'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'KEYTHRI', 'LEANDRO PEREIRA PIMENTEI', '17737720018', '074.957.393-71', '2003-10-22'::date, '(98) 98400-4445', 'leandro@rsitelecom.com.br', '(98) 98400-4445/leandro@rsitelecom.com.br', 'KEYTHRI LEANDRO PEREIRA PIMENTEI;074.957.393-71'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'KEYTHRI' AND am.sobrenome = 'LEANDRO PEREIRA PIMENTEI' AND am.cpf = '074.957.393-71'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LIDER', 'DIEGO SOUSA', 'AGUIAR', '292856920051', '030.154.903-62', '1987-09-14'::date, '(98) 9142-9763', 'diegosousag22@gmail.com', '(98) 9142-9763/diegosousag22@gmail.com', 'DIEGO SOUSA AGUIAR;030.154.903-62'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'DIEGO SOUSA' AND am.sobrenome = 'AGUIAR' AND am.cpf = '030.154.903-62'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'CARLOS ALBERTO', 'OLIVEIRA SILVA', '311575620060', '862.671.833-00', '1971-08-06'::date, '(98) 99244-9028', 'carlos.alberto@rsitelecom.com.br', '(98) 99244-9028/carlos.alberto@rsitelecom.com.br', 'CARLOS ALBERTO OLIVEIRA SILVA;862.671.833-00'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'CARLOS ALBERTO' AND am.sobrenome = 'OLIVEIRA SILVA' AND am.cpf = '862.671.833-00'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'JOSE RIBAMAR', 'SOUZA SILVA FILHO', '241087220030', '288.851.983-68', '1967-01-06'::date, '(98) 9209-7852', 'jrs_sf@hotmail.com', '(98) 9209-7852/jrs_sf@hotmail.com', 'JOSE RIBAMAR SOUZA SILVA FILHO;288.851.983-68'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'JOSE RIBAMAR' AND am.sobrenome = 'SOUZA SILVA FILHO' AND am.cpf = '288.851.983-68'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LIDER', 'LUIS FERNANDO', 'SOARES DO NASCIMENTO', '2796480', '618.851.422-34', '1977-05-30'::date, '(94) 8415-8414', 'luiz.fernando.nascimento.br@gmail.com', '(94) 8415-8414/luiz.fernando.nascimento.br@gmail.com', 'LUIS FERNANDO SOARES DO NASCIMENTO;618.851.422-34'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'LUIS FERNANDO' AND am.sobrenome = 'SOARES DO NASCIMENTO' AND am.cpf = '618.851.422-34'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'OCTAVIO ALEXANDER', 'MENDOZA MENDOZA', 'F584454-Y', '706.567.692-70', '1996-05-29'::date, '(98) 8162-1188', 'octavio.alexander29@gmail.com', '(98) 8162-1188/octavio.alexander29@gmail.com', 'OCTAVIO ALEXANDER MENDOZA MENDOZA;706.567.692-70'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'OCTAVIO ALEXANDER' AND am.sobrenome = 'MENDOZA MENDOZA' AND am.cpf = '706.567.692-70'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LIDER', 'JESUS RAFAEL', 'ROSALES GARCIA', 'B085025-8', '111.478.662-44', '1983-04-01'::date, '(11) 99422-0696', 'ingrosalesjr@gmail.com', '(11) 99422-0696/ingrosalesjr@gmail.com', 'JESUS RAFAEL ROSALES GARCIA;111.478.662-44'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'JESUS RAFAEL' AND am.sobrenome = 'ROSALES GARCIA' AND am.cpf = '111.478.662-44'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'GEOVANNY', 'FRANCISCO ECHEVERRÍA MENDOZA', 'B439042R', '117.842.892-30', '1992-07-16'::date, '(51) 99745-2681', 'geovannnye@gmail.com', '(51) 99745-2681/geovannnye@gmail.com', 'GEOVANNY FRANCISCO ECHEVERRÍA MENDOZA;117.842.892-30'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'GEOVANNY' AND am.sobrenome = 'FRANCISCO ECHEVERRÍA MENDOZA' AND am.cpf = '117.842.892-30'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'TEAM LIDER', 'JORGE LUIS', 'FUENMAYOR SILVA', 'F750921G', '707.496.252-01', '1998-12-15'::date, '(92) 98595-7357', 'jorgefuenmayor2000@gmail.com', '(92) 98595-7357/jorgefuenmayor2000@gmail.com', 'JORGE LUIS FUENMAYOR SILVA;707.496.252-01'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'JORGE LUIS' AND am.sobrenome = 'FUENMAYOR SILVA' AND am.cpf = '707.496.252-01'
  );
INSERT INTO acesso_membros (equipe_id, funcao, nome, sobrenome, rg, cpf, data_nascimento, telefone_particular, email, ihs, winity)
SELECT e.id, 'MEMBRO', 'VILMER JOSE', 'BRACHO MOLERO', 'B355788-R', '116.446.142-78', '2000-09-05'::date, '(95) 98421-2067', 'vilmerbracho2000@gmail.com', '(95) 98421-2067/vilmerbracho2000@gmail.com', 'VILMER JOSE BRACHO MOLERO;116.446.142-78'
FROM acesso_equipes e
WHERE e.nome_equipe = 'NO| INSTALAÇÃO - MANUTENÇÃO'
  AND NOT EXISTS (
    SELECT 1 FROM acesso_membros am WHERE am.equipe_id = e.id AND am.nome = 'VILMER JOSE' AND am.sobrenome = 'BRACHO MOLERO' AND am.cpf = '116.446.142-78'
  );
