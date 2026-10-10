# Deploy do Controle Eolen (Vercel + Supabase)

## 1. Subir o código pro Git

```
cd controle-eolen-web
git init
git add .
git commit -m "Controle Eolen — versão inicial"
```

Crie um repositório vazio no GitHub (ou GitLab/Bitbucket) e envie:

```
git remote add origin <URL do seu repositório>
git branch -M main
git push -u origin main
```

## 2. Conectar na Vercel

1. Entre em vercel.com com a conta **sistemaseolen@gmail.com**.
2. "Add New" → "Project" → selecione o repositório que você acabou de criar.
3. O Next.js é detectado automaticamente — não precisa mudar nada em "Build & Output Settings".
4. **Antes de clicar em Deploy**, configure as variáveis de ambiente abaixo (Settings → Environment Variables, ou na própria tela de import).

## 3. Variáveis de ambiente (Production + Preview + Development)

Nenhum valor real vai neste arquivo — ele fica no repositório do GitHub, e qualquer segredo aqui seria exposto. Pegue o valor de cada uma na hora, no painel do serviço correspondente (ver `.env.example` na raiz do projeto para a lista completa e onde achar cada uma):

| Nome | Onde pegar o valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → controle-eolen → Settings → API → "Project URL" |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → controle-eolen → Settings → API Keys → "Publishable key"/"anon" — pode ficar público (é protegido por Row Level Security), mas ainda assim não precisa virar texto fixo neste arquivo |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → controle-eolen → Settings → API Keys → "Secret keys" (`sb_secret_...`) — **secreto, nunca commitar em nenhum arquivo do repositório**, colar direto no painel da Vercel |
| `CNPJ_LOOKUP_BASE_URL` | opcional — deixe em branco/não crie, o padrão já funciona |

Clique em **Deploy**.

## 4. Depois do primeiro deploy

- Acesse a URL que a Vercel te der (algo como `controle-eolen-web.vercel.app`).
- Login inicial: o e-mail e a senha temporária definidos na criação do primeiro usuário administrador (Supabase → Authentication, ou direto na tela de login do sistema) — o sistema pede pra trocar a senha no primeiro acesso. **Nunca escreva a senha real aqui neste arquivo.**
- Se quiser um domínio próprio (ex.: `controle.eolen.com.br`), isso é feito em Vercel → Project → Settings → Domains, depois de o deploy estar no ar.

## Observações

- Os dados de pessoas/equipes ainda não foram migrados por completo pro banco novo (ficou combinado que isso seria feito depois, com dados atualizados). Empresas e as listas de opções (cargo, projeto, etc.) já estão completas.
- O ambiente de nuvem onde este código foi gerado não tem acesso à internet para testar contra o Supabase de verdade (só alcança pacotes do npm) — por isso a validação completa de ponta a ponta (login, CNPJ, upload de anexo) só pôde ser feita depois deste primeiro deploy. Se algo não funcionar como esperado no ar, me avise que eu ajudo a debugar.
