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
};

module.exports = nextConfig;
