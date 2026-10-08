// Cliente da API de assinatura eletrônica do Docsales (E-Sign API).
//
// Pedido do Diego (24/09/2026): a assinatura da Ficha de EPI desenhada na
// tela (canvas, com o dedo) não tem validade jurídica pros órgãos
// fiscalizadores. A partir de agora, depois de gerar o PDF da ficha (mesmo
// padrão de sempre), em vez de pedir pra assinar na tela, o sistema envia o
// PDF pro Docsales — plataforma de assinatura eletrônica que a Eolen já usa
// e já tem conta — posicionando uma assinatura em cada linha de item e mais
// uma na assinatura final do colaborador. A assinatura é feita remotamente:
// o auditor copia o link (`url_to_sign`) e manda pro colaborador (WhatsApp,
// o canal que for) — não depende do Docsales mandar e-mail/WhatsApp
// sozinho, embora isso también fique ligado como reforço (delivery_method).
//
// Documentação usada como referência (OpenAPI/Swagger da conta do Diego,
// lido em 24/09/2026 em https://web.docsales.com/api-docs/v1/docsales-swagger.yml):
//   POST   /esign/documents?user_email=...   — cria o documento
//   GET    /esign/documents/{id}             — status atual + link de assinatura
//   POST   /esign/documents/{id}/resend      — reenviar (se expirar/perder o link)
//   PUT    /esign/documents/{id}/cancel       — cancelar
//
// Testado em 24/09/2026 (documento de calibração, apagado depois de
// confirmado): x_percentage/y_percentage contam da ESQUERDA e de BAIXO da
// página — igual ao sistema de coordenadas que gerarFichaEpiPdf.ts já usa
// (origem no canto inferior-esquerdo), então NÃO precisa inverter nada ao
// montar `signature_positions` a partir das âncoras desse arquivo.
//
// IMPORTANTE (token): DOCSALES_API_TOKEN é secreto — só usado aqui, no
// servidor. Peça pro Diego configurar em .env.local (dev) e nas variáveis
// de ambiente da Vercel (produção), igual ao SUPABASE_SERVICE_ROLE_KEY.

const DOCSALES_BASE = process.env.DOCSALES_API_BASE || "https://web.docsales.com/api/v1";

function token(): string {
  const t = process.env.DOCSALES_API_TOKEN;
  if (!t) {
    throw new Error("Docsales não configurado: defina DOCSALES_API_TOKEN nas variáveis de ambiente.");
  }
  return t;
}

// E-mail do usuário Docsales em nome de quem os documentos são criados
// (parâmetro obrigatório `user_email` da API) — precisa ser um usuário
// válido da conta Docsales da Eolen. Configurável porque não
// necessariamente é o mesmo e-mail do Diego.
function userEmail(): string {
  const e = process.env.DOCSALES_USER_EMAIL;
  if (!e) {
    throw new Error("Docsales não configurado: defina DOCSALES_USER_EMAIL (um usuário válido da conta Docsales) nas variáveis de ambiente.");
  }
  return e;
}

async function docsalesFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${DOCSALES_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // corpo vazio (ex.: 204) — ok.
  }
  if (!res.ok) {
    const msg = body?.error || body?.message || `Docsales respondeu ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

export type SignaturePositionDocsales = {
  y_percentage: number;
  x_percentage: number;
  signature_size: "small" | "medium" | "large";
};

export type CriarEsignDocumentoInput = {
  pdfBuffer: Buffer;
  code: string; // identificador nosso (ex.: `ficha-epi-treino-<id>-<timestamp>`) — fica salvo como `code` no Docsales e devolvido nos webhooks.
  descricao: string;
  signerName: string;
  signerEmail: string;
  // Uma entrada por página com pelo menos uma posição — página 0-based,
  // igual à API. Ver src/lib/fichaEpiEnvioAssinatura.ts pra como isso é
  // montado a partir das âncoras do gerarFichaEpiPdf.ts.
  signaturePositionsPorPagina: Record<string, SignaturePositionDocsales[]>;
  expirationDate: string; // YYYY-MM-DD
};

export type EsignSigner = {
  id: string;
  name: string;
  email: string;
  status: string; // pending|sent|read|approved|rejected...
  url_to_sign: string | null;
};

export type EsignDocument = {
  id: number;
  code: string | null;
  status: string; // active|sent|approved|rejected|cancelled|expired|read|error
  pdf_url: string | null;
  approval?: { pdf_url: string | null; url_to_view: string | null } | null;
  signers: EsignSigner[];
};

export async function criarEsignDocumento(input: CriarEsignDocumentoInput): Promise<EsignDocument> {
  const pdfB64 = input.pdfBuffer.toString("base64");
  const payload = {
    esign_document: {
      pdf: pdfB64,
      code: input.code,
      language: "pt-BR",
      legislation: "bra",
      description: input.descricao,
      signing_order: false,
      expiration_date: input.expirationDate,
      // Obrigatório ser "signature_upload" quando o documento tem
      // signature_positions (validação da própria API Docsales).
      signature_method: "signature_upload",
      // Pedido do Diego: o link de assinatura aparece no sistema pro
      // auditor copiar e mandar direto — mas deixa o Docsales também
      // mandar por e-mail como reforço (delivery_method.email), já que
      // WhatsApp tem limitação de custo/crédito na conta.
      delivery_method: { email: true, whatsapp: false },
      signers: [
        {
          role: "part", // "Recebi para serem usados..." — o colaborador na condição de parte que recebe o EPI, não um papel jurídico específico da lista do Docsales.
          name: input.signerName,
          email: input.signerEmail,
          signing_order: 1,
          signature_positions: input.signaturePositionsPorPagina,
        },
      ],
    },
  };
  return docsalesFetch(`/esign/documents?user_email=${encodeURIComponent(userEmail())}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function buscarEsignDocumento(idOuCode: string | number): Promise<EsignDocument> {
  return docsalesFetch(`/esign/documents/${idOuCode}`);
}

export async function cancelarEsignDocumento(id: string | number): Promise<void> {
  await docsalesFetch(`/esign/documents/${id}/cancel`, { method: "PUT" });
}

export async function reenviarEsignDocumento(id: string | number): Promise<void> {
  await docsalesFetch(`/esign/documents/${id}/resend`, { method: "POST" });
}
