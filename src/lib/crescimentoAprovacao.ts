// Fluxo de aprovação + documentação obrigatória do Crescimento (pedido do
// Diego, 16/10/2026):
//
//   1. Alguém solicita um crescimento (POST /api/crescimento) -> a pessoa
//      nasce com status CRESCIMENTO e crescimento_aprovacao_status
//      "AGUARDANDO", e o APROVADOR (um único usuário, definido em
//      Administrador -> Configurações, chave `crescimento_aprovador_id`)
//      recebe um e-mail "Crescimento de equipe - <Responsável>".
//   2. O aprovador entra no sistema e Aprova ou Reprova (com motivo) -- ver
//      POST /api/crescimento/[id]/aprovacao.
//      - Aprovado: cria os 13 documentos obrigatórios (DOCS_OBRIGATORIOS_
//        CRESCIMENTO) e a tratativa da documentação começa.
//      - Reprovado: volta pro solicitante corrigir e reenviar (POST
//        /api/crescimento/[id]/reenviar), que manda um e-mail novo pro
//        aprovador.
//   3. O solicitante recebe e-mail quando o pedido é aprovado ou reprovado.
//
// As 13 pessoas que já estavam em Crescimento antes desta regra foram
// marcadas como APROVADO, sem mexer nos documentos delas (decisão do Diego).
import { supabaseAdmin } from "./supabaseAdmin";
import { enviarEmail } from "./msGraphMail";
import type { UsuarioRow } from "./permissions";

export const CHAVE_APROVADOR_CRESCIMENTO = "crescimento_aprovador_id";

export type StatusAprovacaoCrescimento = "AGUARDANDO" | "APROVADO" | "REPROVADO";

// Lista do print mandado pelo Diego -- mesma ordem. Tem que bater com
// CRESCIMENTO_DOCS_OBRIGATORIOS em public/app.js (usado pra calcular a
// porcentagem do andamento na tela).
export const DOCS_OBRIGATORIOS_CRESCIMENTO: Array<{ tipo: string; categoria: "treinamento" | "documento" }> = [
  { tipo: "FICHA DE EPI", categoria: "documento" },
  { tipo: "NR35", categoria: "treinamento" },
  { tipo: "NR10", categoria: "treinamento" },
  { tipo: "PRIMEIROS SOCORROS", categoria: "treinamento" },
  { tipo: "ASO", categoria: "documento" },
  { tipo: "PGR", categoria: "documento" },
  { tipo: "PCMSO", categoria: "documento" },
  { tipo: "NR06", categoria: "treinamento" },
  { tipo: "INTEGRAÇÃO DE SEGURANÇA", categoria: "treinamento" },
  { tipo: "ORDEM DE SERVIÇO (NR01)", categoria: "documento" },
  { tipo: "SEGURO", categoria: "documento" },
  { tipo: "CONTRATO", categoria: "documento" },
  { tipo: "TERMO DE CONSENTIMENTO", categoria: "documento" },
];

type Admin = ReturnType<typeof supabaseAdmin>;

export async function getAprovadorCrescimentoId(admin: Admin): Promise<string | null> {
  const { data } = await admin.from("configuracoes").select("valor").eq("chave", CHAVE_APROVADOR_CRESCIMENTO).maybeSingle();
  const valor = data?.valor;
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

export async function getAprovadorCrescimento(admin: Admin): Promise<{ id: string; nome: string; email: string } | null> {
  const id = await getAprovadorCrescimentoId(admin);
  if (!id) return null;
  const { data } = await admin.from("usuarios").select("id, nome, email, ativo").eq("id", id).maybeSingle();
  if (!data || !data.ativo) return null;
  return { id: data.id, nome: data.nome, email: data.email };
}

export async function isAprovadorCrescimento(admin: Admin, user: UsuarioRow | null | undefined): Promise<boolean> {
  if (!user) return false;
  const id = await getAprovadorCrescimentoId(admin);
  return !!id && id === user.id;
}

// Cria só os documentos obrigatórios que a pessoa ainda NÃO tem (compara
// pelo tipo, sem diferenciar maiúsculas) -- idempotente, então aprovar de
// novo depois de uma reprovação nunca duplica nada.
export async function criarDocumentosObrigatoriosCrescimento(
  admin: Admin,
  pessoa: { id: number; nome: string }
): Promise<{ criados: number; error: string | null }> {
  const { data: existentes, error: fetchError } = await admin.from("treinamentos").select("tipo").eq("pessoa_id", pessoa.id);
  if (fetchError) return { criados: 0, error: fetchError.message };
  const jaTem = new Set((existentes || []).map((t: any) => (t.tipo || "").toString().trim().toUpperCase()));
  const rows = DOCS_OBRIGATORIOS_CRESCIMENTO.filter((d) => !jaTem.has(d.tipo.toUpperCase())).map((doc) => ({
    pessoa_id: pessoa.id,
    pessoa_nome: pessoa.nome,
    tipo: doc.tipo,
    categoria: doc.categoria,
    vencimento: null,
    data_emissao: null,
    situacao_original: "",
    arquivo_path: null,
    arquivo_nome: null,
    observacao: null,
  }));
  if (!rows.length) return { criados: 0, error: null };
  const { error } = await admin.from("treinamentos").insert(rows);
  if (error) return { criados: 0, error: error.message };
  return { criados: rows.length, error: null };
}

function esc(v: any): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linhasPessoa(pessoa: any): string {
  const linhas: Array<[string, any]> = [
    ["Responsável (equipe)", pessoa.responsavel],
    ["Profissional", pessoa.nome],
    ["Função/Cargo", pessoa.cargo],
    ["Projeto", pessoa.projeto],
    ["Regional", pessoa.regional],
    ["Operadora", pessoa.operadora],
    ["Coordenador", pessoa.coordenador],
    ["Empresa", pessoa.empresa_nome],
    ["Tipo de contrato", pessoa.tipo_pessoa],
    ["Solicitado por", pessoa.solicitante_crescimento_nome],
  ];
  return (
    '<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">' +
    linhas
      .map(([k, v]) => `<tr><td style="color:#555;padding-right:16px;">${esc(k)}</td><td><strong>${esc(v || "—")}</strong></td></tr>`)
      .join("") +
    "</table>"
  );
}

// E-mail pro aprovador -- título pedido pelo Diego: "Crescimento de equipe"
// + o nome da equipe, que é o campo "Responsável".
export async function enviarEmailSolicitacaoCrescimento(opts: {
  admin: Admin;
  pessoa: any;
  origin: string;
  reenvio?: boolean;
}): Promise<{ enviado: boolean; aviso: string | null }> {
  const aprovador = await getAprovadorCrescimento(opts.admin);
  if (!aprovador) {
    return {
      enviado: false,
      aviso: "Nenhum aprovador de crescimento definido em Administrador > Configurações -- o pedido ficou aguardando aprovação, mas ninguém foi avisado por e-mail.",
    };
  }
  const link = `${opts.origin}/#/crescimento/${opts.pessoa.id}`;
  const primeiroNome = (aprovador.nome || "").split(" ")[0] || "";
  try {
    await enviarEmail({
      para: aprovador.email,
      assunto: `Crescimento de equipe - ${opts.pessoa.responsavel || opts.pessoa.nome}`,
      htmlBody: `
        <p>Olá, ${esc(primeiroNome)}.</p>
        <p>${opts.reenvio ? "Um pedido de crescimento que tinha sido reprovado foi corrigido e <strong>reenviado</strong> para a sua aprovação." : "Há um novo pedido de <strong>crescimento de equipe</strong> aguardando a sua aprovação."}</p>
        ${linhasPessoa(opts.pessoa)}
        <p style="margin-top:18px;"><a href="${link}">Clique aqui para abrir no Controle Eolen e aprovar ou reprovar</a></p>
        <p style="color:#777;font-size:12px;">Você precisa entrar com o seu usuário para realizar a aprovação.</p>
      `,
    });
    return { enviado: true, aviso: null };
  } catch (e: any) {
    console.error("Falha ao enviar e-mail de solicitação de crescimento:", e);
    return { enviado: false, aviso: "O pedido foi registrado, mas não foi possível enviar o e-mail para o aprovador." };
  }
}

// E-mail pro solicitante quando o aprovador decide (pedido do Diego).
export async function enviarEmailDecisaoCrescimento(opts: {
  admin: Admin;
  pessoa: any;
  origin: string;
  aprovado: boolean;
  motivo?: string | null;
  aprovadorNome: string;
}): Promise<void> {
  const solicitanteId = opts.pessoa.solicitante_crescimento_id;
  if (!solicitanteId) return;
  const { data: solicitante } = await opts.admin
    .from("usuarios")
    .select("nome, email, ativo")
    .eq("id", solicitanteId)
    .maybeSingle();
  if (!solicitante || !solicitante.ativo || !solicitante.email) return;
  const link = `${opts.origin}/#/crescimento/${opts.pessoa.id}`;
  const primeiroNome = (solicitante.nome || "").split(" ")[0] || "";
  try {
    await enviarEmail({
      para: solicitante.email,
      assunto: `Crescimento de equipe - ${opts.pessoa.responsavel || opts.pessoa.nome} - ${opts.aprovado ? "APROVADO" : "REPROVADO"}`,
      htmlBody: `
        <p>Olá, ${esc(primeiroNome)}.</p>
        <p>O pedido de crescimento que você solicitou foi <strong>${opts.aprovado ? "APROVADO" : "REPROVADO"}</strong> por ${esc(opts.aprovadorNome)}.</p>
        ${opts.aprovado ? "" : `<p><strong>Motivo:</strong> ${esc(opts.motivo || "—")}</p><p>Corrija o que for preciso e use o botão "Reenviar para aprovação" na tela do crescimento.</p>`}
        ${opts.aprovado ? "<p>A documentação obrigatória já foi adicionada e pode ser tratada no sistema.</p>" : ""}
        ${linhasPessoa(opts.pessoa)}
        <p style="margin-top:18px;"><a href="${link}">Abrir no Controle Eolen</a></p>
      `,
    });
  } catch (e) {
    console.error("Falha ao enviar e-mail de decisão de crescimento:", e);
  }
}

// Linha de audit_log direto (mesmo padrão de auditMembro em equipes) --
// aprovar/reprovar/reenviar não é um "diff" comum de formulário.
export async function auditAprovacaoCrescimento(
  admin: Admin,
  pessoa: { id: number; nome: string },
  de: string | null,
  para: string,
  usuario: UsuarioRow | null
) {
  const { error } = await admin.from("audit_log").insert({
    entidade: "pessoa",
    entidade_id: pessoa.id,
    entidade_label: pessoa.nome,
    acao: "editar",
    campo: "crescimento_aprovacao_status",
    campo_label: "Aprovação do crescimento",
    de,
    para,
    usuario_id: usuario?.id ?? null,
    usuario_nome: usuario?.nome ?? "—",
  });
  if (error) console.error("Falha ao gravar audit_log da aprovação de crescimento:", error.message);
}
