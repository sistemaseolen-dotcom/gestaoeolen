// Porta do auditDiffFields/auditDelete do app.js original: para cada campo
// da whitelist que mudou entre `before` e `after`, grava uma linha em
// audit_log. Mantém o mesmo comportamento: registros vazios no create não
// entram no log (evita spam ao criar um registro novo).
import { supabaseAdmin } from "./supabaseAdmin";
import type { UsuarioRow } from "./permissions";

export type Entidade = "pessoa" | "equipe" | "empresa" | "treinamento" | "usuario" | "lista" | "patrimonio";

// Rótulos amigáveis por campo, por entidade — espelha FIELD_LABELS do app.js.
export const FIELD_LABELS: Record<string, Record<string, string>> = {
  pessoa: {
    nome: "Nome", cargo: "Cargo", status: "Status", regional: "Regional", projeto: "Projeto",
    operadora: "Operadora", cadastro: "Cadastro", coordenador: "Coordenador", tipo_pessoa: "Tipo de pessoa",
    data_admissao: "Data de admissão", data_demissao: "Data de demissão", matricula_esocial: "Matrícula eSocial",
    cpf: "CPF", rg: "RG", data_nascimento: "Data de nascimento", pis: "PIS", cnh: "CNH",
    data_validade_cnh: "Validade CNH", escolaridade: "Escolaridade", estado_civil: "Estado civil",
    email: "E-mail", telefone: "Telefone", email_corporativo: "E-mail corporativo",
    telefone_corporativo: "Telefone corporativo", cep: "CEP", endereco: "Endereço", numero: "Número",
    complemento: "Complemento", bairro: "Bairro", municipio: "Município", estado: "Estado", mei: "MEI",
    numero_contrato: "Número do contrato", validade_contrato: "Validade do contrato",
    observacao: "Observação", empresa_id: "Empresa", valor_hora: "Valor hora", salario_bruto: "Salário bruto",
  },
  equipe: {
    nome: "Nome", regional: "Regional", projeto: "Projeto", operadora: "Operadora", status: "Status",
    team_lider_id: "Team líder", membros: "Membros",
  },
  empresa: {
    nome: "Razão social", fantasia: "Nome fantasia", cnpj: "CNPJ", porte: "Porte", cidade: "Cidade",
    uf: "UF", cep: "CEP", bairro: "Bairro", logradouro: "Logradouro", numero: "Número", telefone: "Telefone",
    email: "E-mail", nome_responsavel: "Responsável", regional: "Regional", cnae_principal: "CNAE principal",
    cnae_descricao: "Descrição CNAE", pgr: "PGR", pcmso: "PCMSO", situacao_cadastral: "Situação cadastral",
    status: "Status",
  },
  treinamento: {
    tipo: "Tipo", categoria: "Categoria", situacao_original: "Situação", vencimento: "Vencimento",
    data_emissao: "Data de emissão", observacao: "Observação", arquivo_nome: "Arquivo",
  },
  patrimonio: {
    codigo: "Código", tipo: "Tipo", modelo: "Modelo", serie: "Série", valor: "Valor",
    status: "Status", responsavel_nome: "Responsável",
  },
};

export async function auditDiffFields(opts: {
  entidade: Entidade;
  entidadeId: number;
  entidadeLabel: string;
  before: Record<string, any> | null;
  after: Record<string, any>;
  campos: string[];
  usuario: UsuarioRow | null;
}) {
  const { entidade, entidadeId, entidadeLabel, before, after, campos, usuario } = opts;
  const rows: any[] = [];
  const labels = FIELD_LABELS[entidade] || {};

  for (const campo of campos) {
    const de = before ? stringify(before[campo]) : null;
    const para = stringify(after[campo]);
    if (before === null && !para) continue; // create: campo vazio não gera log
    if (de === para) continue;
    rows.push({
      entidade,
      entidade_id: entidadeId,
      entidade_label: entidadeLabel,
      acao: before === null ? "criar" : "editar",
      campo,
      campo_label: labels[campo] || campo,
      de,
      para,
      usuario_id: usuario?.id ?? null,
      usuario_nome: usuario?.nome ?? "—",
    });
  }

  if (rows.length === 0) return;
  const { error } = await supabaseAdmin().from("audit_log").insert(rows);
  if (error) throw error;
}

export async function auditDelete(entidade: Entidade, entidadeId: number, label: string, usuario: UsuarioRow | null) {
  const { error } = await supabaseAdmin().from("audit_log").insert({
    entidade,
    entidade_id: entidadeId,
    entidade_label: label,
    acao: "excluir",
    campo: null,
    campo_label: null,
    de: null,
    para: null,
    usuario_id: usuario?.id ?? null,
    usuario_nome: usuario?.nome ?? "—",
  });
  if (error) throw error;
}

function stringify(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}
