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
  },
};

module.exports = nextConfig;
