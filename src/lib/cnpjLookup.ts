// Consulta de CNPJ (espelho da Receita Federal) — extraído de
// src/app/api/empresas/cnpj-lookup/route.ts pra também ser usado pela aba
// "Crescimento" (pedido do Diego, 15/10/2026): ao digitar o CNPJ/MEI da
// empresa contratante no formulário de Crescimento, busca os dados reais
// dela em vez de depender de uma empresa já cadastrada em "Empresas" — já
// que Crescimento é sempre gente nova, a empresa pode ser nova também (ver
// POST /api/crescimento, que usa isto pra achar ou criar a empresa).
//
// Serviço público gratuito (sem chave, sem captcha) que espelha os dados
// oficiais da Receita Federal. Verificado manualmente contra CNPJs reais
// antes de integrar — ver /root/.claude/plans/abstract-meandering-nebula.md.
const BASE_URL = process.env.CNPJ_LOOKUP_BASE_URL || "https://publica.cnpj.ws/cnpj";

export function onlyDigitsCnpj(v: string) {
  return (v || "").replace(/\D/g, "");
}

function normalizeSituacao(v: string | null | undefined): string | null {
  if (!v) return null;
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

export interface CnpjLookupResult {
  nome: string;
  fantasia: string;
  cnpj: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  porte: string;
  cnaePrincipal: string;
  cnaeDescricao: string;
  situacaoCadastral: string | null;
}

export class CnpjLookupError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function buscarCnpj(cnpjDigitsRaw: string): Promise<CnpjLookupResult> {
  const cnpjDigits = onlyDigitsCnpj(cnpjDigitsRaw);
  if (cnpjDigits.length !== 14) {
    throw new CnpjLookupError("Informe um CNPJ com 14 dígitos.", 400);
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${BASE_URL}/${cnpjDigits}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new CnpjLookupError("Não foi possível consultar o CNPJ agora. Tente novamente em instantes.", 502);
  }

  if (upstreamRes.status === 404) {
    throw new CnpjLookupError("CNPJ não encontrado.", 404);
  }
  if (upstreamRes.status === 429) {
    throw new CnpjLookupError("Muitas consultas em pouco tempo. Aguarde um instante e tente de novo.", 429);
  }
  if (!upstreamRes.ok) {
    throw new CnpjLookupError("Serviço de consulta de CNPJ indisponível no momento.", 502);
  }

  const raw = await upstreamRes.json();
  const est = raw?.estabelecimento || {};
  const telefone = est.ddd1 && est.telefone1 ? `(${est.ddd1}) ${est.telefone1}` : "";

  return {
    nome: raw?.razao_social || "",
    fantasia: est.nome_fantasia || "",
    cnpj: cnpjDigits,
    logradouro: [est.tipo_logradouro, est.logradouro].filter(Boolean).join(" ").trim(),
    numero: est.numero || "",
    complemento: est.complemento || "",
    bairro: est.bairro || "",
    cidade: est.cidade?.nome || "",
    uf: est.estado?.sigla || "",
    cep: est.cep || "",
    telefone,
    email: est.email || "",
    porte: raw?.porte?.descricao || "",
    cnaePrincipal: est.atividade_principal?.subclasse || "",
    cnaeDescricao: est.atividade_principal?.descricao || "",
    situacaoCadastral: normalizeSituacao(est.situacao_cadastral),
  };
}
