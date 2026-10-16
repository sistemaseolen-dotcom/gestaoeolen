// Helpers compartilhados pelas rotas de /api/externa/* (API externa,
// autenticada por token -- ver src/lib/apiTokenAuth.ts). Mantém a paginação
// num padrão único em todos os recursos, já que várias dessas tabelas são
// grandes (treinamentos tem +9000 linhas, veiculo_km_lancamentos +11000) e o
// PostgREST do Supabase corta em silêncio acima do limite configurado no
// projeto (ver mesmo comentário em /api/state).
export interface Paginacao {
  pagina: number;
  tamanho: number;
  from: number;
  to: number;
}

export function paginacaoFromUrl(url: URL, tamanhoPadrao = 200, tamanhoMaximo = 500): Paginacao {
  const paginaRaw = Number(url.searchParams.get("pagina"));
  const tamanhoRaw = Number(url.searchParams.get("tamanho"));
  const pagina = Number.isFinite(paginaRaw) && paginaRaw >= 1 ? Math.floor(paginaRaw) : 1;
  const tamanho =
    Number.isFinite(tamanhoRaw) && tamanhoRaw >= 1 ? Math.min(tamanhoMaximo, Math.floor(tamanhoRaw)) : tamanhoPadrao;
  const from = (pagina - 1) * tamanho;
  const to = from + tamanho - 1;
  return { pagina, tamanho, from, to };
}

// Formato de resposta padrão de toda rota paginada em /api/externa/* --
// `total` vem de um count() separado (exact, head-only, sem custo de trazer
// as linhas de novo) pra quem consome a API saber quantas páginas existem.
export function respostaPaginada<T>(dados: T[], paginacao: Paginacao, total: number | null) {
  return {
    dados,
    pagina: paginacao.pagina,
    tamanho: paginacao.tamanho,
    total: total ?? null,
  };
}

// Remove campos sensíveis de um objeto antes de devolver pra fora -- usado
// pra nunca deixar senha/credencial escapar pela API externa, mesmo que a
// tabela em si guarde esse dado pra uso interno do sistema. Devolve uma
// cópia nova, nunca muta o objeto original.
export function semCampos<T extends Record<string, any>>(obj: T, campos: string[]): T {
  const copia = { ...obj };
  for (const campo of campos) delete (copia as any)[campo];
  return copia;
}
