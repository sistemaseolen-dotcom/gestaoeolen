import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/apiTokenAuth";
import { paginacaoFromUrl, respostaPaginada } from "@/lib/externalApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// API EXTERNA (pedido do Diego, 16/10/2026) -- autenticada por token, pra
// outros sistemas lerem o cadastro de Pessoas (inclui quem está em
// "Crescimento": é a MESMA tabela, só filtrar ?status=CRESCIMENTO). Nunca
// expõe aba Administrador (usuários/permissões).
//
// Lista EXPLÍCITA de colunas (whitelist, não "select *") -- de propósito
// deixa de fora `isignum_senha` e `isdp_senha`: são credenciais de acesso
// aos sistemas do cliente (Isignum/ISDP), nunca devem sair por uma API pra
// fora da empresa. `empresa_id` também fica de fora (coluna legada, a aba
// Empresas foi removida -- ver src/lib/empresaEmbutida.ts).
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

export async function GET(req: Request) {
  const gate = await requireApiToken(req);
  if (gate.response) return gate.response;

  const url = new URL(req.url);
  const paginacao = paginacaoFromUrl(url);
  const admin = supabaseAdmin();

  // Filtros opcionais -- ?status=CRESCIMENTO devolve exatamente o mesmo
  // recorte que a aba "Crescimento" mostra (mesma tabela `pessoas`, sem
  // rota separada). ?cpf= aceita com ou sem pontuação.
  const status = url.searchParams.get("status");
  const cpf = url.searchParams.get("cpf");

  let query = admin.from("pessoas").select(COLUNAS_PESSOA, { count: "exact" }).order("id");
  if (status) query = query.eq("status", status.toUpperCase());
  if (cpf) query = query.eq("cpf", cpf.replace(/\D/g, ""));
  query = query.range(paginacao.from, paginacao.to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(respostaPaginada(data || [], paginacao, count));
}
