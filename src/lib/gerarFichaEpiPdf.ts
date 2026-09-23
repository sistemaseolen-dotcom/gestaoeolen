// Gera um PDF da "Ficha de EPI" no mesmo padrão do formulário real usado
// pela Eolen ("FORMULÁRIO DE CONTROLE DE EPI'S", REV.: 01) — pedido do
// Diego: depois de uma auditoria encontrar um CA que não confere (o
// equipamento em uso já não é o que está registrado na ficha), o sistema
// gera uma ficha NOVA, com os CAs corrigidos, assinada na tela pelo próprio
// colaborador (por item, com o dedo), pra já deixar tudo formalizado sem
// depender de imprimir/assinar em papel de novo.
//
// As proporções do formulário (larguras de coluna, altura de linha) foram
// medidas em 4 fichas reais (Alex Lima, Janderson Gabriel, José Gregório
// Guzman Roche, Cesar Oswaldo Ávila) analisando onde ficam as linhas de
// grade da tabela na imagem renderizada do PDF original — ver o histórico
// de investigação do bug "capacete não encontrado" pra esse mesmo formulário
// (src/lib/fichaEpiOcr.ts). Não é um clone byte-a-byte do formulário
// original (esse é gerado por uma ferramenta de assinatura eletrônica de
// terceiro) — é uma reconstrução própria, no mesmo layout/proporções, pra
// ficar reconhecível como "a mesma ficha".
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type ItemFichaGerada = {
  especificacao: string;
  ca: string;
  qtd?: string;
  fabricacao?: string | null;
  entrega?: string | null;
  // PNG em base64 (com ou sem o prefixo "data:image/png;base64,") da
  // assinatura feita na tela, com o dedo, especificamente pra esta linha —
  // pedido do Diego: cada item assinado individualmente, igual ao
  // formulário original (uma ASSINATURA por linha da tabela).
  assinaturaPngBase64?: string | null;
  // true quando este item teve o CA corrigido nesta rodada (a divergência
  // encontrada na auditoria) — usado só pra destacar visualmente a linha
  // no PDF gerado (fundo levemente diferente), não muda a estrutura.
  alterado?: boolean;
};

export type DadosFichaEpiPdf = {
  pessoaNome: string;
  cpf?: string | null;
  empresaNome?: string | null;
  cnpj?: string | null;
  // "Grupo Homogêneo de Exposição" — não existe um campo equivalente
  // cadastrado em `pessoas` hoje; nas 4 fichas reais usadas de referência
  // esse campo sempre veio "EXTERNO" (colaborador terceirizado atuando no
  // site do cliente), então esse é o padrão aqui. Dá pra tornar
  // configurável no futuro se aparecer um caso diferente.
  ghe?: string;
  funcao?: string | null;
  itens: ItemFichaGerada[];
};

const PAGE_W = 595.28; // A4 retrato, em pontos (72dpi) — mesmo tamanho do formulário original.
const PAGE_H = 841.89;
const MARGIN = 24;

// Larguras de coluna da tabela ITEM/CA/QTD/ESPECIFICAÇÃO/FABRICAÇÃO/ENTREGA/
// DEVOLUÇÃO/ASSINATURA — medidas como fração da largura da página no
// formulário real (ver comentário no topo do arquivo) e aplicadas aqui
// sobre a largura útil (PAGE_W - 2*MARGIN).
const COLS_FRAC = [
  { key: "item", label: "ITEM", x0: 0.0036, x1: 0.0391 },
  { key: "ca", label: "CA", x0: 0.0391, x1: 0.1346 },
  { key: "qtd", label: "QTD", x0: 0.1346, x1: 0.1665 },
  { key: "especificacao", label: "ESPECIFICAÇÃO", x0: 0.1665, x1: 0.3736 },
  { key: "fabricacao", label: "FABRICAÇÃO", x0: 0.3736, x1: 0.501 },
  { key: "entrega", label: "ENTREGA", x0: 0.501, x1: 0.6284 },
  { key: "devolucao", label: "DEVOLUÇÃO", x0: 0.6284, x1: 0.7557 },
  { key: "assinatura", label: "ASSINATURA", x0: 0.7557, x1: 0.9948 },
];

const TABLE_LEFT = MARGIN;
const TABLE_RIGHT = PAGE_W - MARGIN;
const TABLE_WIDTH = TABLE_RIGHT - TABLE_LEFT;

function colX(frac: number): number {
  return TABLE_LEFT + frac * TABLE_WIDTH;
}

const ROW_H = 30; // altura de cada linha de item — um pouco maior que o
// original (~18pt) pra caber uma assinatura desenhada à mão legível.
const HEADER_ROW_H = 20;
const TITLE_H = 34;
const FIELD_ROW_H = 20;

function hoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function drawRect(page: PDFPage, x: number, y: number, w: number, h: number, opts?: { fill?: [number, number, number] }) {
  page.drawRectangle({
    x, y, width: w, height: h,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
    color: opts?.fill ? rgb(...opts.fill) : undefined,
  });
}

function drawText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number, opts?: { bold?: PDFFont; center?: [number, number]; maxWidth?: number }) {
  const f = opts?.bold || font;
  let t = text || "";
  let s = size;
  if (opts?.maxWidth) {
    // Primeiro tenta encolher a fonte (até um mínimo legível) — só corta
    // caractere pra não deixar nada visível (texto longo demais mesmo no
    // menor tamanho) como último recurso, porque cortar sigla/nome no meio
    // fica confuso num documento oficial.
    while (s > 6 && f.widthOfTextAtSize(t, s) > opts.maxWidth) {
      s -= 0.5;
    }
    while (t.length > 1 && f.widthOfTextAtSize(t, s) > opts.maxWidth) {
      t = t.slice(0, -1);
    }
  }
  let drawX = x;
  if (opts?.center) {
    const [cx0, cx1] = opts.center;
    const w = f.widthOfTextAtSize(t, s);
    drawX = cx0 + ((cx1 - cx0) - w) / 2;
  }
  page.drawText(t, { x: drawX, y, size: s, font: f, color: rgb(0, 0, 0) });
}

function headerFieldRow(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  top: number,
  left: { label: string; value: string; labelW: number },
  right: { label: string; value: string; labelW: number },
  splitFrac = 0.72
) {
  const midX = TABLE_LEFT + TABLE_WIDTH * splitFrac; // divisor entre o bloco esquerdo e o direito — varia por linha (ver chamadas), pra caber valores longos como a Função.
  drawRect(page, TABLE_LEFT, top - FIELD_ROW_H, midX - TABLE_LEFT, FIELD_ROW_H);
  drawRect(page, midX, top - FIELD_ROW_H, TABLE_RIGHT - midX, FIELD_ROW_H);
  drawText(page, bold, left.label, TABLE_LEFT + 4, top - FIELD_ROW_H + 6, 9);
  drawText(page, font, left.value, TABLE_LEFT + 4 + left.labelW + 3, top - FIELD_ROW_H + 6, 9, { maxWidth: midX - TABLE_LEFT - left.labelW - 10 });
  drawText(page, bold, right.label, midX + 4, top - FIELD_ROW_H + 6, 9);
  drawText(page, font, right.value, midX + 4 + right.labelW + 3, top - FIELD_ROW_H + 6, 9, { maxWidth: TABLE_RIGHT - midX - right.labelW - 10 });
  return top - FIELD_ROW_H;
}

function drawTableHeaderRow(page: PDFPage, bold: PDFFont, top: number): number {
  for (const col of COLS_FRAC) {
    const x0 = colX(col.x0);
    const x1 = colX(col.x1);
    drawRect(page, x0, top - HEADER_ROW_H, x1 - x0, HEADER_ROW_H, { fill: [0.85, 0.85, 0.85] });
    drawText(page, bold, col.label, x0, top - HEADER_ROW_H + 6, 7.5, { center: [x0, x1] });
  }
  return top - HEADER_ROW_H;
}

async function embedAssinatura(pdfDoc: PDFDocument, base64: string | null | undefined) {
  if (!base64) return null;
  try {
    const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
    const bytes = Buffer.from(clean, "base64");
    return await pdfDoc.embedPng(bytes);
  } catch {
    return null;
  }
}

export async function gerarFichaEpiPdf(dados: DadosFichaEpiPdf): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function novaPagina() {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }

  function cabecalho() {
    // Título + caixa "REV.: 01"
    const revW = 70;
    drawRect(page, TABLE_LEFT, y - TITLE_H, TABLE_WIDTH - revW, TITLE_H);
    drawRect(page, TABLE_RIGHT - revW, y - TITLE_H, revW, TITLE_H);
    drawText(page, bold, "FORMULÁRIO DE CONTROLE DE EPI'S", TABLE_LEFT, y - TITLE_H / 2 - 5, 13, {
      center: [TABLE_LEFT, TABLE_RIGHT - revW],
    });
    drawText(page, bold, "REV.: 01", TABLE_RIGHT - revW, y - TITLE_H / 2 - 4, 9, {
      center: [TABLE_RIGHT - revW, TABLE_RIGHT],
    });
    y -= TITLE_H;

    y = headerFieldRow(page, font, bold, y,
      { label: "EMPRESA:", value: dados.empresaNome || "", labelW: 48 },
      { label: "CNPJ:", value: dados.cnpj || "", labelW: 32 });
    y = headerFieldRow(page, font, bold, y,
      { label: "NOME:", value: dados.pessoaNome || "", labelW: 40 },
      { label: "CPF:", value: dados.cpf || "", labelW: 28 });
    y = headerFieldRow(page, font, bold, y,
      { label: "GHE:", value: dados.ghe || "EXTERNO", labelW: 30 },
      { label: "FUNÇÃO:", value: dados.funcao || "", labelW: 44 },
      0.32); // GHE costuma ser uma palavra curta ("EXTERNO") — Função pode ser longa, então essa linha reparte diferente das duas de cima.

    y -= 4;
    y = drawTableHeaderRow(page, bold, y);
  }

  cabecalho();

  for (let i = 0; i < dados.itens.length; i++) {
    if (y - ROW_H < MARGIN + 40) {
      novaPagina();
      cabecalho();
    }
    const item = dados.itens[i];
    const rowTop = y;
    const fill: [number, number, number] | undefined = item.alterado ? [1, 0.96, 0.85] : undefined;

    for (const col of COLS_FRAC) {
      const x0 = colX(col.x0);
      const x1 = colX(col.x1);
      drawRect(page, x0, rowTop - ROW_H, x1 - x0, ROW_H, { fill });
    }

    const textY = rowTop - ROW_H / 2 - 3;
    drawText(page, font, String(i + 1), colX(COLS_FRAC[0].x0), textY, 9, { center: [colX(COLS_FRAC[0].x0), colX(COLS_FRAC[0].x1)] });
    drawText(page, item.alterado ? bold : font, item.ca || "", colX(COLS_FRAC[1].x0), textY, 9, { center: [colX(COLS_FRAC[1].x0), colX(COLS_FRAC[1].x1)] });
    drawText(page, font, item.qtd || "1", colX(COLS_FRAC[2].x0), textY, 9, { center: [colX(COLS_FRAC[2].x0), colX(COLS_FRAC[2].x1)] });
    drawText(page, font, item.especificacao || "", colX(COLS_FRAC[3].x0) + 4, textY, 9, { maxWidth: colX(COLS_FRAC[3].x1) - colX(COLS_FRAC[3].x0) - 8 });
    drawText(page, font, item.fabricacao || "", colX(COLS_FRAC[4].x0), textY, 8, { center: [colX(COLS_FRAC[4].x0), colX(COLS_FRAC[4].x1)] });
    drawText(page, font, item.entrega || hoje(), colX(COLS_FRAC[5].x0), textY, 8, { center: [colX(COLS_FRAC[5].x0), colX(COLS_FRAC[5].x1)] });

    const assinaturaImg = await embedAssinatura(pdfDoc, item.assinaturaPngBase64);
    if (assinaturaImg) {
      const cellX0 = colX(COLS_FRAC[7].x0);
      const cellX1 = colX(COLS_FRAC[7].x1);
      const cellW = cellX1 - cellX0 - 8;
      const cellH = ROW_H - 6;
      const scale = Math.min(cellW / assinaturaImg.width, cellH / assinaturaImg.height, 1);
      const w = assinaturaImg.width * scale;
      const h = assinaturaImg.height * scale;
      page.drawImage(assinaturaImg, {
        x: cellX0 + (cellX1 - cellX0 - w) / 2,
        y: rowTop - ROW_H + (ROW_H - h) / 2,
        width: w,
        height: h,
      });
    }

    y -= ROW_H;
  }

  y -= 24;
  if (y < MARGIN + 20) {
    novaPagina();
  }
  drawText(page, font, `Ficha regenerada pelo Controle Eolen em ${hoje()} — CA(s) corrigido(s) após auditoria.`, TABLE_LEFT, y, 8);

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
