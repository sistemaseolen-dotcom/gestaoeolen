import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized, forbidden } from "@/lib/authGuard";
import { canDo } from "@/lib/permissions";

// Serviço público gratuito (sem chave, sem captcha) que espelha os dados
// oficiais da Receita Federal. Verificado manualmente contra CNPJs reais
// antes de integrar — ver /root/.claude/plans/abstract-meandering-nebula.md.
// Como esta chamada roda no SERVIDOR (rota /api), não existe o bloqueio de
// rede que existia na versão antiga (página publicada via Claude Artifact).
const BASE_URL = process.env.CNPJ_LOOKUP_BASE_URL || "https://publica.cnpj.ws/cnpj";

function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "");
}

function normalizeSituacao(v: string | null | undefined): string | null {
  if (!v) return null;
  // Remove acentos e deixa em maiúsculas, para casar com a convenção usada
  // no restante do app (ATIVA/INATIVA/BAIXADA + legado INAPTA/SUSPENSA/NULA).
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  // Quem pode criar OU editar uma empresa pode buscar o CNPJ.
  if (!canDo(user, "empresas", "criar") && !canDo(user, "empresas", "editar")) {
    return forbidden();
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const cnpjDigits = onlyDigits(body?.cnpj || "");
  if (cnpjDigits.length !== 14) {
    return NextResponse.json({ error: "Informe um CNPJ com 14 dígitos." }, { status: 400 });
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${BASE_URL}/${cnpjDigits}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      // evita ficar pendurado indefinidamente se o serviço externo cair
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Não foi possível consultar o CNPJ agora. Tente novamente em instantes." },
      { status: 502 }
    );
  }

  if (upstreamRes.status === 404) {
    return NextResponse.json({ error: "CNPJ não encontrado." }, { status: 404 });
  }
  if (upstreamRes.status === 429) {
    return NextResponse.json(
      { error: "Muitas consultas em pouco tempo. Aguarde um instante e tente de novo." },
      { status: 429 }
    );
  }
  if (!upstreamRes.ok) {
    return NextResponse.json(
      { error: "Serviço de consulta de CNPJ indisponível no momento." },
      { status: 502 }
    );
  }

  const raw = await upstreamRes.json();
  const est = raw?.estabelecimento || {};

  const telefone = est.ddd1 && est.telefone1 ? `(${est.ddd1}) ${est.telefone1}` : "";

  const result = {
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

  return NextResponse.json({ empresa: result });
}
