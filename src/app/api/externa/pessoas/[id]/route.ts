import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/apiTokenAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Mesma whitelist de colunas de GET /api/externa/pessoas (duplicada de
// propósito, mesmo padrão já usado no resto do projeto entre rota de lista
// e rota de item único) -- nunca inclui isignum_senha/isdp_senha.
const COLUNAS_PESSOA = [
  "id", "nome", "tipo_pessoa", "regional", "estado_atuacao", "cadastro", "coordenador",
  "data_admissao", "data_demissao", "matricula_esocial", "cbo", "cargo", "cargo_aso",
  "email", "telefone", "email_corporativo", "telefone_corporativo", "sexo",
  "data_nascimento", "estado_civil", "cpf", "rg", "pis", "cnh", "data_validade_cnh",
  "categoria_cnh", "escolaridade", "status", "cep", "endereco", "numero", "complemento",
  "bairro", "municipio", "estado", "mei", "contrato", "numero_contrato", "validade_contrato",
  "valor_hora", "salario_bruto", "projeto", "operadora", "telefone_vivo", "matricula_vivo",
  "status_vivo", "observacao", "isignum_id", "isdp_id", "contas", "responsavel",
  "nome_do_pai", "nome_da_mae", "numero_contato_emergencia", "solicitante_crescimento_nome",
  "empresa_cnpj", "empresa_razao_social", "empresa_fantasia", "empresa_nome", "empresa_porte",
  "empresa_cidade", "empresa_uf", "empresa_cep", "empresa_bairro", "empresa_logradouro",
  "empresa_numero", "empresa_telefone", "empresa_email", "empresa_nome_responsavel",
  "empresa_cnae_principal", "empresa_cnae_descricao", "empresa_situacao_cadastral",
  "criado_em", "atualizado_em",
].join(", ");

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireApiToken(req, "pessoas");
  if (gate.response) return gate.response;

  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (Number.isNaN(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const { data, error } = await supabaseAdmin().from("pessoas").select(COLUNAS_PESSOA).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Pessoa não encontrada." }, { status: 404 });

  return NextResponse.json(data);
}
