// Constantes da aba "Acesso" (pedido do Diego, 28/09/2026): equipes de
// campo organizadas por operadora/projeto/regional, com os dados de cada
// integrante (incluindo credenciais de acesso aos sistemas da operadora).
// Espelha as mesmas listas fixas já usadas em public/app.js — mantidas aqui
// também porque as rotas de API validam o que vem do cliente antes de
// gravar (nunca confiar só na validação do front-end).
//
// PROJETOS reaproveita exatamente os valores de AUDITORIA_CLIENTES
// (public/app.js) e REGIONAIS os de AUDITORIA_REGIONAIS — o Diego confirmou
// que são as mesmas listas already usadas em Auditorias, então não criamos
// uma terceira variação com grafia diferente.
export const ACESSO_OPERADORAS = ["TIM", "CLARO", "VIVO"] as const;
export type AcessoOperadora = (typeof ACESSO_OPERADORAS)[number];

export const ACESSO_PROJETOS = ["HUAWEI", "NOKIA", "ERICSSON", "TELEFONICA"] as const;
export type AcessoProjeto = (typeof ACESSO_PROJETOS)[number];

export const ACESSO_REGIONAIS = ["CO", "ES", "MG", "NE", "NO", "RJ", "SP", "SUL"] as const;
export type AcessoRegional = (typeof ACESSO_REGIONAIS)[number];

export function validarOperadora(v: any): string | null {
  const s = (v || "").toString().trim().toUpperCase();
  return (ACESSO_OPERADORAS as readonly string[]).includes(s) ? s : null;
}

// Filtra silenciosamente qualquer valor fora da lista, em vez de rejeitar a
// requisição inteira — evita que um valor legado/digitado errado impeça de
// salvar o resto da equipe.
export function filtrarLista(valores: any, listaValida: readonly string[]): string[] {
  if (!Array.isArray(valores)) return [];
  const set = new Set(listaValida);
  const out: string[] = [];
  for (const v of valores) {
    const s = (v || "").toString().trim().toUpperCase();
    if (set.has(s) && out.indexOf(s) === -1) out.push(s);
  }
  return out;
}

// Campos de um integrante da equipe (acesso_membros) — client (camelCase) ->
// coluna (snake_case). Centralizado aqui porque POST e PATCH de membro
// precisam do mesmo mapeamento, e a lista é grande (dados pessoais +
// credenciais de acesso à operadora).
export const CAMPOS_ACESSO_MEMBRO: Array<[campoBody: string, coluna: string]> = [
  ["funcao", "funcao"],
  ["sobrenome", "sobrenome"],
  ["rg", "rg"],
  ["oe", "oe"],
  ["cpf", "cpf"],
  ["dataNascimento", "data_nascimento"],
  ["telefoneParticular", "telefone_particular"],
  ["telefoneVivo", "telefone_vivo"],
  ["email", "email"],
  ["emailCorporativo", "email_corporativo"],
  ["filiacao", "filiacao"],
  ["veiculo", "veiculo"],
  ["cnpj", "cnpj"],
  ["pis", "pis"],
  ["sap", "sap"],
  ["redecorp", "redecorp"],
  ["sigitm", "sigitm"],
  ["senha", "senha"],
  ["vaAccess", "va_access"],
  ["imei", "imei"],
  ["atcVivo", "atc_vivo"],
  ["highlineVivo", "highline_vivo"],
  ["ihs", "ihs"],
  ["winity", "winity"],
];

// Monta o patch a partir do body — só inclui a chave se ela veio no body
// (`hasOwnProperty`), pra PATCH não sobrescrever com null campos que o
// cliente simplesmente não mandou. `apenasPresentes = false` (usado no
// POST) inclui todas, tratando ausente como null.
export function montarPatchMembro(body: any, opts?: { apenasPresentes?: boolean }): Record<string, any> {
  const apenasPresentes = !!opts?.apenasPresentes;
  const patch: Record<string, any> = {};
  for (const [campoBody, coluna] of CAMPOS_ACESSO_MEMBRO) {
    const presente = Object.prototype.hasOwnProperty.call(body, campoBody);
    if (apenasPresentes && !presente) continue;
    const raw = presente ? body[campoBody] : null;
    patch[coluna] = raw === undefined || raw === null || raw === "" ? null : String(raw).trim();
  }
  return patch;
}
