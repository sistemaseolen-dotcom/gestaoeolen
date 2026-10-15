// Dados de empresa embutidos em PESSOAS -- pedido do Diego (15/10/2026):
// "gostaria de vincular as informações que estão dentro de empresas dentro
// das informações de pessoas. Assim, a gente não precisa ter uma aba de
// pessoas e uma aba de empresas, apenas a aba de pessoas." Em vez de uma
// tabela separada, cada pessoa carrega sua própria cópia dos dados da
// empresa (colunas empresa_* -- ver migração embute_dados_empresa_em_
// pessoas). O CNPJ (só dígitos) é a chave natural que agrupa pessoas da
// MESMA empresa (ex.: os 52 funcionários da ALLIANCE SERVICES PLUS DO
// BRASIL), já que não existe mais uma linha única de "empresa" pra
// apontar via FK.
//
// Confirmado com o Diego: quando um campo de empresa é editado numa
// pessoa, propaga AUTOMATICAMENTE pras outras pessoas com o mesmo CNPJ
// (nunca deixa divergir).
//
// `empresas` / `pessoas.empresa_id` continuam existindo por enquanto -- a
// aba Empresas ainda não foi removida (Diego quer comparar/validar antes).
// As rotas que usam este helper continuam fazendo o upsert de
// compatibilidade em `empresas` separadamente (resolveOrCreateEmpresaPorCnpj
// em pessoas/route.ts e crescimento/route.ts) -- este arquivo só cuida dos
// campos empresa_* embutidos, que passam a ser a fonte exibida na ficha de
// Pessoa.
import { supabaseAdmin } from "./supabaseAdmin";
import { auditDiffFields } from "./audit";
import type { UsuarioRow } from "./permissions";
import { buscarCnpj, onlyDigitsCnpj } from "./cnpjLookup";

// Colunas embutidas em `pessoas` (snake_case) -- usadas tanto pro SELECT de
// cache/propagação quanto pro diff de auditoria.
export const CAMPOS_EMPRESA_EMBUTIDA = [
  "empresa_cnpj", "empresa_razao_social", "empresa_fantasia", "empresa_porte",
  "empresa_cidade", "empresa_uf", "empresa_cep", "empresa_bairro", "empresa_logradouro",
  "empresa_numero", "empresa_telefone", "empresa_email", "empresa_nome_responsavel",
  "empresa_cnae_principal", "empresa_cnae_descricao", "empresa_situacao_cadastral",
  "empresa_pgr", "empresa_pcmso", "empresa_contratos", "empresa_tipo_pj", "empresa_observacao",
] as const;

// Mapa camelCase (body da API / formulário) <-> coluna snake_case.
export const MAPA_CAMPOS_EMPRESA_EMBUTIDA: Record<string, string> = {
  empresaCnpj: "empresa_cnpj",
  empresaRazaoSocial: "empresa_razao_social",
  empresaFantasia: "empresa_fantasia",
  empresaPorte: "empresa_porte",
  empresaCidade: "empresa_cidade",
  empresaUf: "empresa_uf",
  empresaCep: "empresa_cep",
  empresaBairro: "empresa_bairro",
  empresaLogradouro: "empresa_logradouro",
  empresaNumero: "empresa_numero",
  empresaTelefone: "empresa_telefone",
  empresaEmail: "empresa_email",
  empresaNomeResponsavel: "empresa_nome_responsavel",
  empresaCnaePrincipal: "empresa_cnae_principal",
  empresaCnaeDescricao: "empresa_cnae_descricao",
  empresaSituacaoCadastral: "empresa_situacao_cadastral",
  empresaPgr: "empresa_pgr",
  empresaPcmso: "empresa_pcmso",
  empresaContratos: "empresa_contratos",
  empresaTipoPj: "empresa_tipo_pj",
  empresaObservacao: "empresa_observacao",
};

// Pega só as chaves camelCase de `body` que vieram preenchidas e devolve o
// objeto já em snake_case, pronto pra INSERT/UPDATE em `pessoas`. Usado nas
// rotas de Pessoas e Crescimento -- o formulário sempre manda o conjunto
// inteiro (pré-preenchido pela busca de CNPJ), então aqui é só repassar.
export function colunasEmpresaFromBody(body: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [campoBody, coluna] of Object.entries(MAPA_CAMPOS_EMPRESA_EMBUTIDA)) {
    if (Object.prototype.hasOwnProperty.call(body || {}, campoBody)) {
      out[coluna] = body[campoBody];
    }
  }
  if (typeof out.empresa_cnpj === "string") {
    out.empresa_cnpj = onlyDigitsCnpj(out.empresa_cnpj) || null;
  }
  return out;
}

// Converte o formato camelCase devolvido por buscarDadosEmpresaEmbutida
// direto pras colunas snake_case de `pessoas` -- usado pelas rotas que
// resolvem a empresa inteiramente no servidor (ex.: Crescimento, cujo
// formulário não tem campos manuais de empresa como PGR/PCMSO visíveis).
export function colunasEmpresaFromDados(dados: Record<string, any>): Record<string, any> {
  return {
    empresa_cnpj: dados.cnpj || null,
    empresa_razao_social: dados.razaoSocial || null,
    empresa_fantasia: dados.fantasia || null,
    empresa_porte: dados.porte || null,
    empresa_cidade: dados.cidade || null,
    empresa_uf: dados.uf || null,
    empresa_cep: dados.cep || null,
    empresa_bairro: dados.bairro || null,
    empresa_logradouro: dados.logradouro || null,
    empresa_numero: dados.numero || null,
    empresa_telefone: dados.telefone || null,
    empresa_email: dados.email || null,
    empresa_nome_responsavel: dados.nomeResponsavel || null,
    empresa_cnae_principal: dados.cnaePrincipal || null,
    empresa_cnae_descricao: dados.cnaeDescricao || null,
    empresa_situacao_cadastral: dados.situacaoCadastral || null,
    empresa_pgr: dados.pgr || null,
    empresa_pcmso: dados.pcmso || null,
    empresa_contratos: dados.contratos || null,
    empresa_tipo_pj: dados.tipoPj || null,
    empresa_observacao: dados.observacao || null,
  };
}

// Mesma consulta de CNPJ, mas CACHE-FIRST: se já existe alguma pessoa
// cadastrada com esse CNPJ, reaproveita os dados que já estão salvos nela
// (inclusive os campos manuais -- PGR, PCMSO, contratos, tipo PJ,
// observação -- que a Receita não devolve), em vez de bater na Receita de
// novo e perder esses dados manuais. Só consulta a Receita quando é CNPJ
// realmente novo no sistema. Usada pelos endpoints de busca
// (/api/pessoas/cnpj-lookup, /api/crescimento/cnpj-lookup) pra pré-preencher
// o formulário -- depois disso, o valor final salvo é sempre o que o
// cliente mandar no body (igual qualquer outro campo do formulário).
export async function buscarDadosEmpresaEmbutida(cnpjDigitsRaw: string): Promise<Record<string, any> & { cacheHit: boolean }> {
  const cnpjDigits = onlyDigitsCnpj(cnpjDigitsRaw);
  const admin = supabaseAdmin();

  // O select string é montado dinamicamente a partir de CAMPOS_EMPRESA_EMBUTIDA
  // (pra nunca ficar fora de sincronia com a lista de colunas) -- por isso o
  // `as any`: o parser de tipos do supabase-js só reconhece strings literais.
  const { data: existente } = await admin
    .from("pessoas")
    .select([...CAMPOS_EMPRESA_EMBUTIDA].join(", ") as any)
    .eq("empresa_cnpj", cnpjDigits)
    .limit(1)
    .maybeSingle() as { data: Record<string, any> | null };

  if (existente) {
    return {
      cnpj: existente.empresa_cnpj,
      razaoSocial: existente.empresa_razao_social,
      fantasia: existente.empresa_fantasia,
      porte: existente.empresa_porte,
      cidade: existente.empresa_cidade,
      uf: existente.empresa_uf,
      cep: existente.empresa_cep,
      bairro: existente.empresa_bairro,
      logradouro: existente.empresa_logradouro,
      numero: existente.empresa_numero,
      telefone: existente.empresa_telefone,
      email: existente.empresa_email,
      nomeResponsavel: existente.empresa_nome_responsavel,
      cnaePrincipal: existente.empresa_cnae_principal,
      cnaeDescricao: existente.empresa_cnae_descricao,
      situacaoCadastral: existente.empresa_situacao_cadastral,
      pgr: existente.empresa_pgr,
      pcmso: existente.empresa_pcmso,
      contratos: existente.empresa_contratos,
      tipoPj: existente.empresa_tipo_pj,
      observacao: existente.empresa_observacao,
      cacheHit: true,
    };
  }

  const dados = await buscarCnpj(cnpjDigits);
  return {
    cnpj: dados.cnpj,
    razaoSocial: dados.nome || null,
    fantasia: dados.fantasia || null,
    porte: dados.porte || null,
    cidade: dados.cidade || null,
    uf: dados.uf || null,
    cep: dados.cep || null,
    bairro: dados.bairro || null,
    logradouro: dados.logradouro || null,
    numero: dados.numero || null,
    telefone: dados.telefone || null,
    email: dados.email || null,
    nomeResponsavel: null,
    cnaePrincipal: dados.cnaePrincipal || null,
    cnaeDescricao: dados.cnaeDescricao || null,
    situacaoCadastral: dados.situacaoCadastral || null,
    pgr: null,
    pcmso: null,
    contratos: null,
    tipoPj: null,
    observacao: null,
    cacheHit: false,
  };
}

// Propaga os campos empresa_* pras OUTRAS pessoas que compartilham o mesmo
// CNPJ (ex.: os outros 51 funcionários da Alliance quando 1 deles é
// editado) -- só grava/audita nas linhas que realmente mudariam algo, pra
// não gerar ruído quando a pessoa é salva por qualquer outro motivo sem
// que os dados da empresa tenham mudado de fato.
export async function propagarCamposEmpresa(
  admin: ReturnType<typeof supabaseAdmin>,
  cnpjDigits: string | null | undefined,
  pessoaIdOrigem: number,
  campos: Record<string, any>,
  usuario: UsuarioRow | null
): Promise<number> {
  if (!cnpjDigits) return 0;

  const { data: outras, error } = await admin
    .from("pessoas")
    .select(["id", "nome", ...CAMPOS_EMPRESA_EMBUTIDA].join(", ") as any)
    .eq("empresa_cnpj", cnpjDigits)
    .neq("id", pessoaIdOrigem) as { data: Record<string, any>[] | null; error: any };
  if (error) throw error;
  if (!outras || outras.length === 0) return 0;

  let atualizadas = 0;
  for (const pessoa of outras as any[]) {
    const diff: Record<string, any> = {};
    for (const campo of CAMPOS_EMPRESA_EMBUTIDA) {
      if (!Object.prototype.hasOwnProperty.call(campos, campo)) continue;
      if ((pessoa[campo] ?? null) !== (campos[campo] ?? null)) diff[campo] = campos[campo];
    }
    if (Object.keys(diff).length === 0) continue;

    const { data: after, error: updError } = await admin
      .from("pessoas")
      .update(diff)
      .eq("id", pessoa.id)
      .select()
      .single();
    if (updError) throw updError;

    await auditDiffFields({
      entidade: "pessoa",
      entidadeId: pessoa.id,
      entidadeLabel: pessoa.nome,
      before: pessoa,
      after,
      campos: Object.keys(diff),
      usuario,
    });
    atualizadas++;
  }
  return atualizadas;
}
