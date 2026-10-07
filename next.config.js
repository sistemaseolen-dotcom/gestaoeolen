/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // O rastreamento automático de dependências da Vercel não detecta:
  // (1) o modelo do Tesseract em tessdata/, porque o caminho é montado em
  //     tempo de execução (src/lib/fichaEpiOcr.ts usa path.join(process.cwd(),
  //     ...), não uma string fixa);
  // (2) os próprios pacotes tesseract.js/tesseract.js-core/wasm-feature-detect
  //     por completo, porque o tesseract.js roda seu OCR numa worker thread
  //     separada (worker_threads), que carrega e faz `require` de arquivos
  //     direto do disco em tempo de execução — invisível pro rastreamento
  //     estático do Next/webpack, que só analisa o grafo de imports normal.
  // Sem isto, a leitura da Ficha de EPI funcionaria aqui (ambiente com
  // node_modules completo) mas falharia em produção na Vercel por faltar
  // arquivo.
  experimental: {
    outputFileTracingIncludes: {
      "/api/**/*": [
        "./tessdata/**",
        "./node_modules/tesseract.js/**",
        "./node_modules/tesseract.js-core/**",
        "./node_modules/wasm-feature-detect/**",
        "./node_modules/mupdf/**",
      ],
    },
    // O pacote `mupdf` usa, por dentro, `createRequire(import.meta.url)`
    // pra carregar seu binário WASM — um padrão pensado pra rodar direto
    // no Node, não pra ser empacotado pelo webpack. Quando o Next tenta
    // empacotar (bundle) esse pacote junto com o resto do código, essa
    // parte quebra em produção (erro real visto: "e is not a function",
    // porque o `createRequire` some no meio do empacotamento) mesmo
    // funcionando normalmente em ambiente de teste local sem bundling.
    // `tesseract.js` tem o mesmo problema por outro motivo: ele calcula o
    // caminho do arquivo da sua worker thread (`worker-script/node/index.js`)
    // com base em `__dirname`, que depois do empacotamento do webpack
    // aponta pra dentro de `.next/`, não mais pra `node_modules/tesseract.js`
    // (erro visto: "Cannot find module '.next/worker-script/node/index.js'").
    // Colocando os dois aqui, o Next para de empacotá-los e passa a
    // carregá-los direto do node_modules em tempo de execução — do jeito
    // que eles foram feitos pra funcionar.
    serverComponentsExternalPackages: ["mupdf", "tesseract.js"],
  },
  // Cabeçalhos de segurança HTTP (pedido do Diego, 10/2026 — revisão geral
  // de segurança). Nenhum CSP aqui de propósito: o app.js é um SPA grande
  // com estilo/scripts inline espalhados pelo código, então uma Content-
  // Security-Policy precisa ser desenhada com calma testando cada tela —
  // colocar uma apressada quebraria o sistema em produção. Os cabeçalhos
  // abaixo são seguros por padrão, não quebram nada existente:
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Impede que o navegador "adivinhe" o tipo de um arquivo servido
          // (ex.: tratar um upload de foto como script) — mitiga alguns
          // ataques de XSS via upload de arquivo.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Ninguém deveria carregar o sistema dentro de um <iframe> de
          // outro site (clickjacking) — o sistema não é embutido em nada.
          { key: "X-Frame-Options", value: "DENY" },
          // Não manda a URL completa (que pode ter dados sensíveis em
          // query string) como Referer pra sites de terceiros.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Bloqueia câmera/microfone/pagamento por padrão; geolocalização
          // fica permitida só pro próprio site, porque as Auditorias usam
          // a localização do navegador (navigator.geolocation).
          { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), geolocation=(self)" },
          // Reforça HTTPS mesmo que alguém digite http:// por engano — a
          // Vercel já redireciona, isto é defesa em profundidade.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
