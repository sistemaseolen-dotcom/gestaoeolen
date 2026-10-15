// Leitura automática da "Ficha de EPI" (Formulário de Controle de EPI's) —
// pedido do Diego: quando o auditor digita o número do CA de um equipamento
// em campo, o sistema confere na hora se bate com o CA que está na ficha do
// colaborador (hoje só um PDF, sem nenhum dado estruturado no GPO).
//
// O PDF desse formulário (gerado pela ferramenta de assinatura eletrônica
// usada pela Eolen) NÃO tem texto de verdade dentro — testei com uma ficha
// real e um extrator de texto comum devolve zero caracteres: a página é
// renderizada/escaneada como imagem. Por isso o caminho aqui é:
//   1) renderizar a página 1 do PDF como imagem (mupdf, WASM, sem
//      dependência de binário nativo — funciona em ambiente serverless);
//   2) recortar da imagem só as colunas "CA" e "ESPECIFICAÇÃO" da tabela —
//      a coluna "ASSINATURA", com a rubrica sobreposta, é a parte que mais
//      confunde o OCR, e cortá-la fora deixa a leitura bem mais confiável
//      (validado numa ficha real: 9/9 linhas corretas depois do recorte,
//      contra menos da metade lendo a página inteira de uma vez);
//   3) OCR (Tesseract, também sem binário nativo) em cada coluna isolada.
//
// As posições das colunas abaixo foram calibradas em DUAS fichas reais
// (Alex Lima e Janderson Gabriel, ambas formulário "REV.: 01") e são
// expressas como FRAÇÃO da página renderizada — não pixels fixos — pra
// tolerar pequenas variações de tamanho. Se a Eolen um dia mudar o layout
// desse formulário (nova revisão), essas frações precisam ser
// recalibradas — por isso toda falha de leitura aqui é tratada como "não
// deu pra ler automaticamente", nunca como "não confere", pra nunca gerar
// um falso "não conforme" pro auditor.
//
// IMPORTANTE (bug já visto e corrigido uma vez, não reintroduzir): um
// recorte de coluna HORIZONTALMENTE largo demais faz o Tesseract parar de
// reconhecer linha por linha — ele só devolve a primeira linha (ou nada)
// do recorte inteiro, mesmo com a faixa vertical certinha cobrindo todas
// as linhas da tabela. A causa exata não foi confirmada (provavelmente a
// análise de layout do Tesseract interpreta o recorte largo como um bloco
// só, não como uma coluna de linhas separadas), mas o efeito é
// reproduzível: com as frações antigas (x0:0.036,x1:0.137, quase o dobro
// da largura real dos dígitos do CA) a ficha do Janderson não lia
// NENHUMA linha (OCR vazio) nem na coluna do CA nem na de ESPECIFICAÇÃO,
// enquanto a mesma ficha lida com um recorte mais estreito (perto da
// largura real do texto) leu as 9 linhas certas com confiança alta. As
// frações abaixo já são as calibradas (estreitas) — se precisar ajustar
// de novo por causa de outra ficha, ajuste a LARGURA (x0/x1) com cautela,
// mantendo-a próxima da largura real do texto, e não apenas "para
// garantir" deixando mais larga.
import { createWorker } from "tesseract.js";
import sharp from "sharp";
import path from "path";

// `fabricacao` (mês/ano de fabricação do equipamento, já normalizado pro
// formato MM/AAAA usado no resto do sistema, ex.: "07/2024") só vem
// preenchido quando a coluna FABRICAÇÃO do PDF foi lida com confiança — ver
// fabricacaoDaLinha. Pedido do Diego (24/09/2026): antes disso, o OCR só
// lia CA e ESPECIFICAÇÃO; fichas antigas já lidas antes desta mudança
// continuam sem fabricação até serem relidas ("Reler ficha").
export type ItemFichaEpi = { especificacao: string; ca: string; fabricacao?: string | null };

export type ResultadoOcrFichaEpi =
  | { ok: true; itens: ItemFichaEpi[] }
  | { ok: false; motivo: string };

// Frações (x0 a x1) relativas à LARGURA da página renderizada.
//
// Recalibradas (15/10/2026, com o PDF real da ficha do Gustavo Ariel de
// Souza em mãos): o Diego reportou vários números de CA saindo errados
// mesmo com o whitelist de caracteres aplicado (ver comentário dentro de
// extrairItensFichaEpi) -- ex.: "34491" lido como "3449", "40196" como
// "4019", sempre faltando o ÚLTIMO dígito. Rodei uma detecção automática
// das linhas de grade da tabela nessa ficha (escaneando colunas/linhas de
// pixel escuro na página renderizada a 300dpi, não "no olho" como da vez
// anterior) e achei a divisória real CA|QTD em ~0.1503 da largura da
// página -- o x1 antigo (0.12) cortava quase 35% da largura real da
// coluna, exatamente o suficiente pra sumir com o último dígito de CAs de
// 5 dígitos (QTD confirma: a antiga x1=0.12 só tinha a casa por nela ir
// bem pouco além do começo, e no OCR o dígito cortado às vezes virava
// outro número, às vezes sumia de vez). Os valores novos usam a largura
// REAL da coluna (medida, com uma margem pequena de cada lado pra não
// pegar a própria linha de grade) -- não é mais largo o bastante pra
// reintroduzir o bug antigo de "recorte largo demais quebra a leitura
// linha-a-linha" (documentado no topo deste arquivo), só deixou de cortar
// o próprio texto que devia caber ali.
const COL_CA = { x0: 0.064, x1: 0.146 };
const COL_ESPECIFICACAO = { x0: 0.185, x1: 0.376 };
// Mesma recalibração (15/10/2026) e mesmo método -- divisória real
// ESPECIFICAÇÃO|FABRICAÇÃO em ~0.3801 e FABRICAÇÃO|ENTREGA em ~0.5026.
const COL_FABRICACAO = { x0: 0.384, x1: 0.499 };
// Faixa vertical (relativa à ALTURA) que cobre as 20 linhas da tabela, sem
// o cabeçalho "ITEM | CA | QTD | ..." acima dela. y0 precisa ficar ANTES do
// topo da linha 1 (senão a linha 1 fica cortada e nunca é lida).
//
// Bug real visto em produção (reportado pelo Diego): nas fichas do José
// Gregório Guzman Roche e do Cesar Oswaldo Ávila, o item 1 (CAPACETE) nunca
// era encontrado ("Item não encontrado na ficha da pessoa"), mesmo a ficha
// estando correta. Comparando as posições reais da linha 1 nessas duas
// fichas com as duas fichas usadas antes pra calibrar (Alex Lima e
// Janderson Gabriel), a tabela some pra cima ou pra baixo dependendo de
// quanto texto tem no cabeçalho (campo "EMPRESA", etc.) — ou seja, a
// posição da linha 1 NÃO é fixa nem entre fichas da mesma "REV.: 01". Com
// y0:0.197 (valor antigo), a linha 1 do José Gregório e do Cesar Oswaldo já
// tinha passado inteira ANTES do recorte começar — por isso nunca era lida,
// nunca virava um item, e a busca por "CAPACETE" dava "não encontrado".
// 0.174 foi o valor escolhido na época (o mais cedo confirmado nas 4 fichas
// reais disponíveis) pra nunca mais cortar a linha 1 inteira.
//
// Problema NOVO visto com esse valor fixo (reportado pelo Diego, 15/10/2026,
// ficha do Gustavo Ariel de Souza): 0.174 é cedo o bastante, nessa ficha,
// pra grudar um pedacinho da própria linha do cabeçalho ("ITEM CA QTD
// ESPECIFICAÇÃO...") direto na linha 1, sem espaço em branco suficiente
// entre os dois pro OCR separar em duas linhas distintas -- aí o
// guarda-corpo `ehLinhaDeCabecalho` abaixo (que descartaria um vazamento
// limpo, como nas fichas de calibração) não tem o que descartar, porque o
// vazamento já corrompeu a linha 1 inteira ("CAPACETE" virou "CAFALVE ITE",
// "14816" virou "14010" -- mesmo com os outros 8 itens da mesma ficha lendo
// 100% certo). Ou seja: y0 cedo demais gruda o cabeçalho na linha 1;
// y0 tarde demais corta a linha 1 inteira -- uma fração FIXA nunca acerta
// as duas coisas ao mesmo tempo pra toda ficha, porque a altura do
// cabeçalho ACIMA da tabela (EMPRESA/NOME/FUNÇÃO) varia conforme o tamanho
// de cada campo.
//
// Correção definitiva: em vez de adivinhar uma fração fixa, `acharTopoDaLinha1`
// (abaixo) DETECTA a posição real da grade da tabela em CADA ficha (mesmo
// método usado pra calibrar as colunas acima, só que em tempo de execução,
// não no olho uma vez só) -- e y0 é calculado a partir disso. y0:0.174 vira
// só o FALLBACK, usado apenas se a detecção não achar uma grade clara o
// bastante (ficha com qualidade de digitalização ruim, por exemplo) --
// nesse caso o comportamento é o de antes, nunca pior.
const LINHAS_Y = { y0: 0.174, y1: 0.727 };

// Faixa (fração da LARGURA) da coluna "ITEM" (os números 1, 2, 3... de cada
// linha) -- usada só pra `acharTopoDaLinha1` detectar a grade horizontal.
// Fica à esquerda da coluna CA (que começa em COL_CA.x0) e não tem rubrica
// nem texto livre que atrapalhe a detecção das linhas de grade.
const COL_ITEM_PARA_DETECCAO = { x0: 0.025, x1: 0.055 };

// Altura de cada linha da tabela (fração da ALTURA da página) -- medida nas
// fichas reais disponíveis (inclusive a do Gustavo) e estável entre elas,
// já que é definida pelo próprio layout impresso do formulário "REV.: 01"
// (só a altura do CABEÇALHO ACIMA da tabela varia, não a altura das linhas
// da tabela em si). Usada por `acharTopoDaLinha1` pra reconhecer onde a
// grade regular de 20 linhas começa.
const ALTURA_LINHA_TABELA = 0.0234;

// Acha a posição real (fração da altura da página) do TOPO da linha 1 (a
// primeira linha de equipamento, logo abaixo do cabeçalho "ITEM | CA | QTD
// | ESPECIFICAÇÃO | ..." da tabela) nesta ficha específica -- ver o
// comentário completo acima de LINHAS_Y sobre por que isso precisa ser
// detectado por ficha, não adivinhado uma vez só.
//
// Como funciona: conta, linha por linha de pixel, quantos pixels escuros
// tem dentro da coluna ITEM (que é só números e linhas de grade, nada mais)
// -- uma linha de grade horizontal aparece como uma faixa inteira de pixels
// escuros. A faixa ACIMA da tabela (EMPRESA/NOME/FUNÇÃO) tem espaçamento
// IRREGULAR entre essas faixas; a grade da própria tabela (cabeçalho
// "ITEM|CA|QTD|..." + as 20 linhas de equipamento) tem espaçamento
// perfeitamente REGULAR, de ALTURA_LINHA_TABELA em ALTURA_LINHA_TABELA --
// é só achar onde começa essa regularidade. A 1ª faixa regular é o TOPO do
// cabeçalho "ITEM|CA|QTD|..."; a linha 1 de equipamento começa exatamente
// uma altura de linha depois disso.
//
// Devolve `null` se não achar uma sequência regular clara (ficha com
// digitalização ruim, por exemplo) -- nesse caso o chamador cai pro y0 fixo
// de LINHAS_Y, igual ao comportamento de antes desta correção.
async function acharTopoDaLinha1(pageBuf: Buffer): Promise<number | null> {
  const meta = await sharp(pageBuf).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (!width || !height) return null;

  const left = Math.max(0, Math.round(COL_ITEM_PARA_DETECCAO.x0 * width));
  const right = Math.min(width, Math.round(COL_ITEM_PARA_DETECCAO.x1 * width));
  const colWidth = Math.max(1, right - left);

  const { data, info } = await sharp(pageBuf)
    .extract({ left, top: 0, width: colWidth, height })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const limiarEscuros = w * 0.85;

  // Agrupa faixas consecutivas de "linha escura" no CENTRO de cada faixa --
  // cada linha de grade real tem 2-3px de espessura no render a 300dpi.
  const linhasDetectadas: number[] = [];
  let emFaixa = false;
  let inicioFaixa = 0;
  for (let y = 0; y < h; y++) {
    let escuros = 0;
    const offset = y * w;
    for (let x = 0; x < w; x++) {
      if (data[offset + x] < 120) escuros++;
    }
    const ehFaixaEscura = escuros >= limiarEscuros;
    if (ehFaixaEscura && !emFaixa) {
      emFaixa = true;
      inicioFaixa = y;
    } else if (!ehFaixaEscura && emFaixa) {
      emFaixa = false;
      linhasDetectadas.push((inicioFaixa + y - 1) / 2);
    }
  }
  if (emFaixa) linhasDetectadas.push((inicioFaixa + h - 1) / 2);

  if (linhasDetectadas.length < 5) return null;

  const alturaLinhaPx = ALTURA_LINHA_TABELA * h;
  const toleranciaPx = Math.max(4, alturaLinhaPx * 0.12);

  for (let i = 0; i < linhasDetectadas.length - 4; i++) {
    let regular = true;
    for (let k = 0; k < 4; k++) {
      const gap = linhasDetectadas[i + k + 1] - linhasDetectadas[i + k];
      if (Math.abs(gap - alturaLinhaPx) > toleranciaPx) {
        regular = false;
        break;
      }
    }
    if (regular) {
      // linhasDetectadas[i] é o topo do cabeçalho "ITEM|CA|QTD|..." -- a
      // linha 1 de equipamento começa uma linha depois (linhasDetectadas[i+1]).
      return linhasDetectadas[i + 1] / h;
    }
  }
  return null;
}

// Se um pedaço da linha de cabeçalho ("CA" / "ESPECIFICAÇÃO") vazar pro
// recorte (ver comentário acima), essa linha precisa ser descartada ANTES
// do pareamento por índice — não só quando os dígitos do CA vierem vazios,
// porque se o vazamento acontecer em só UMA das duas colunas (não nas duas
// igualmente), descartar só depois do pareamento deixaria todo o resto da
// tabela desalinhado (linha N de uma coluna pareada com a linha N+1 da
// outra). Esses dois textos de cabeçalho são fixos e não têm como colidir
// com o nome de um equipamento de verdade.
function ehLinhaDeCabecalho(linhaNormalizada: string): boolean {
  return linhaNormalizada === "CA" || linhaNormalizada.indexOf("ESPECIFICA") !== -1 || linhaNormalizada.indexOf("FABRICA") !== -1;
}

// Mês impresso na ficha como abreviação em português ("jul/24", "mar/24").
// `normalizarTexto` já troca a barra por espaço, então a linha chega aqui
// como "JUL 24".
const MESES_ABREV: Record<string, string> = {
  JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06",
  JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12",
};

// Devolve a fabricação já no formato MM/AAAA (mesmo formato usado no resto
// do sistema — ver FABRICACAO_REGEX em gerar-ficha-epi/route.ts e
// normalizarFabricacao em epiChecklist.ts/app.js), ou null se a linha não
// tiver o formato "mês abreviado + 2 dígitos de ano" reconhecível — nunca
// arrisca devolver uma data errada, só "não deu pra ler esse item" (mesma
// filosofia do resto deste arquivo). Ano de 2 dígitos assumido 20xx: os
// equipamentos registrados aqui são todos recentes, nunca de antes de 2000.
function fabricacaoDaLinha(linha: string): string | null {
  const texto = normalizarTexto(linha);
  const m = texto.match(/([A-Z]{3})\s*(\d{2})(?!\d)/);
  if (!m) return null;
  const mes = MESES_ABREV[m[1]];
  if (!mes) return null;
  return `${mes}/${2000 + Number(m[2])}`;
}

const DPI_RENDER = 300;

// Diretório com o modelo de idioma do Tesseract já baixado localmente (em vez
// de buscar num CDN em tempo de execução — o CDN padrão do tesseract.js é
// bloqueado pela rede deste ambiente, e depender de um CDN externo também
// não é o ideal para produção). Deve ser publicado junto com o deploy.
const TESSDATA_PATH = path.join(process.cwd(), "tessdata");

function normalizarTexto(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// O número do CA nunca tem letra — pega a primeira sequência de 3 a 6
// dígitos que aparecer na linha reconhecida pelo OCR.
//
// Bug real visto numa ficha (reportado pelo Diego): CAs de 5 dígitos vêm
// impressos na ficha com "." separando milhar (ex.: "39.538"). Sem tratar
// isso, a busca por dígitos consecutivos parava no ponto e só achava "538"
// (os 3 dígitos depois do ponto — "39" antes dele tem só 2, não bate o
// mínimo de 3 exigido acima), gerando um falso "não confere" contra o CA
// certo (39538) que o auditor digitou. Por isso o ponto (ou vírgula) entre
// um dígito e um grupo de exatamente 3 dígitos é removido ANTES de procurar
// a sequência — "39.538" vira "39538" antes do match.
function digitosDaLinha(linha: string): string | null {
  const semSeparadorDeMilhar = (linha || "").replace(/(\d)[.,](\d{3})(?!\d)/g, "$1$2");
  const m = semSeparadorDeMilhar.match(/\d{3,6}/);
  return m ? m[0] : null;
}

async function rasterizarPrimeiraPagina(buffer: Buffer): Promise<Buffer | null> {
  // Import dinâmico: `mupdf` é uma biblioteca pesada (WASM) — só carregamos
  // quando esta função é realmente chamada (upload de uma Ficha de EPI em
  // PDF), não em todo carregamento do servidor.
  const mupdf: any = await import("mupdf");
  const doc = mupdf.Document.openDocument(buffer, "application/pdf");
  if (doc.countPages() < 1) return null;
  const page = doc.loadPage(0);
  const scale = DPI_RENDER / 72;
  const matrix = mupdf.Matrix.scale(scale, scale);
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
  return Buffer.from(pixmap.asPNG());
}

async function recortarColuna(
  pageBuf: Buffer,
  frac: { x0: number; x1: number },
  linhasY: { y0: number; y1: number }
): Promise<Buffer> {
  const meta = await sharp(pageBuf).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const left = Math.max(0, Math.round(frac.x0 * width));
  const right = Math.min(width, Math.round(frac.x1 * width));
  const top = Math.max(0, Math.round(linhasY.y0 * height));
  const bottom = Math.min(height, Math.round(linhasY.y1 * height));
  return sharp(pageBuf)
    .extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
    // Upscale leve ajuda o Tesseract em textos pequenos.
    .resize({ width: Math.max(1, right - left) * 2 })
    .png()
    .toBuffer();
}

export async function extrairItensFichaEpi(buffer: Buffer): Promise<ResultadoOcrFichaEpi> {
  let pageBuf: Buffer | null;
  try {
    pageBuf = await rasterizarPrimeiraPagina(buffer);
  } catch (err: any) {
    console.error("[fichaEpiOcr] Falha ao abrir o PDF:", err?.stack || err);
    return { ok: false, motivo: `Falha ao abrir o PDF: ${err?.message || err}` };
  }
  if (!pageBuf) return { ok: false, motivo: "PDF sem páginas." };

  let worker: any;
  try {
    // IMPORTANTE: em Node, tesseract.js detecta suporte a instruções WASM
    // "relaxed SIMD" para escolher qual núcleo carregar — nesse ambiente
    // (e aparentemente em algumas versões recentes do Node/V8) essa detecção
    // dá um falso positivo: diz que há suporte, mas o núcleo escolhido falha
    // ao rodar de verdade (erro "missing function: ...DotProductSSE...").
    // A correção está em `patches/wasm-feature-detect+*.patch` (aplicado
    // automaticamente pelo script "postinstall" via patch-package), que
    // força essa detecção a sempre dizer "não suportado" — assim o
    // tesseract.js sempre carrega o núcleo LSTM comum, sem SIMD, que
    // funciona de forma confiável. Sem esse patch, todo OCR aqui quebra.
    worker = await createWorker("eng", 1, {
      langPath: TESSDATA_PATH,
      gzip: true,
      cacheMethod: "none",
    });

    // Pedido do Diego (15/10/2026, com ficha real do Gustavo Ariel de Souza
    // em mãos pra comparar lado a lado): vários números de CA estavam saindo
    // errados da leitura. A causa PRINCIPAL (dígito final sumindo em vários
    // CAs de 5 dígitos, tipo "34491" virar "3449") era o recorte da coluna
    // CA ficar mais estreito que a coluna real -- já corrigido acima, ver
    // comentário de COL_CA. Esta restrição de alfabeto aqui é uma segunda
    // camada de proteção (técnica padrão do Tesseract pra campo com alfabeto
    // restrito): sem ela, o modelo "eng" tenta decidir entre dígito e letra
    // parecida (0/O, 1/l, 8/B etc.) mesmo numa coluna que só tem números, o
    // que pode trocar um caractere mesmo com o recorte certinho.
    // `tessedit_char_whitelist` restringe o reconhecimento ao alfabeto real
    // de cada coluna (só dígitos no CA; só letras maiúsculas e espaço na
    // ESPECIFICAÇÃO -- nunca tem dígito nesse formulário; letras, dígitos,
    // espaço e "/" na FABRICAÇÃO, que imprime "mês/ano" tipo "set/22").
    //
    // IMPORTANTE: as três colunas usam o MESMO worker (criar um worker novo
    // por coluna custaria tempo/memória demais num ambiente serverless, e
    // isso aqui já roda por ficha inteira, não por linha) -- por isso as
    // três chamadas rodam em SEQUÊNCIA, nunca em paralelo (Promise.all):
    // setParameters muda o estado do worker inteiro, então rodar em paralelo
    // arriscaria aplicar o whitelist errado numa coluna por causa da ordem
    // de execução não-determinística entre as três chamadas concorrentes.
    //
    // `linhasYEfetivo`: ver acharTopoDaLinha1 e o comentário longo em
    // LINHAS_Y -- usa a grade real desta ficha quando consegue detectar, e
    // só cai pro y0 fixo (LINHAS_Y.y0) se a detecção não achar nada confiável.
    const topoLinha1Detectado = await acharTopoDaLinha1(pageBuf as Buffer);
    const linhasYEfetivo = { y0: topoLinha1Detectado ?? LINHAS_Y.y0, y1: LINHAS_Y.y1 };

    async function ocrColuna(frac: { x0: number; x1: number }, whitelist: string): Promise<string[]> {
      const recorte = await recortarColuna(pageBuf as Buffer, frac, linhasYEfetivo);
      await worker.setParameters({ tessedit_char_whitelist: whitelist });
      const { data } = await worker.recognize(recorte);
      return (data.text || "")
        .split("\n")
        .map((l: string) => l.trim())
        .filter(Boolean);
    }

    let linhasCa = await ocrColuna(COL_CA, "0123456789");
    let linhasEspecificacao = await ocrColuna(COL_ESPECIFICACAO, "ABCDEFGHIJKLMNOPQRSTUVWXYZ ");
    let linhasFabricacao = await ocrColuna(COL_FABRICACAO, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/ ");

    // Descarta um possível vazamento da linha de cabeçalho (ver comentário
    // de LINHAS_Y) em CADA coluna independentemente — só pode acontecer na
    // primeira linha lida, já que o recorte agora começa levemente dentro
    // da linha do cabeçalho pra garantir que a linha 1 nunca fique de fora.
    if (linhasCa.length && ehLinhaDeCabecalho(normalizarTexto(linhasCa[0]))) {
      linhasCa = linhasCa.slice(1);
    }
    if (linhasEspecificacao.length && ehLinhaDeCabecalho(normalizarTexto(linhasEspecificacao[0]))) {
      linhasEspecificacao = linhasEspecificacao.slice(1);
    }
    if (linhasFabricacao.length && ehLinhaDeCabecalho(normalizarTexto(linhasFabricacao[0]))) {
      linhasFabricacao = linhasFabricacao.slice(1);
    }

    // As três colunas vêm da mesma faixa vertical, então tendem a produzir
    // uma linha por item na mesma ordem — casamos pelo índice, só até o
    // menor tamanho das três (uma coluna "perder" uma linha é possível, mas
    // rara depois do recorte isolado). A coluna FABRICAÇÃO costuma sobrar
    // uma linha de ruído no final (texto de rodapé vazando no recorte) —
    // por isso ela não entra no cálculo do CA/ESPECIFICAÇÃO de cada linha,
    // só complementa quando dá pra ler.
    const total = Math.min(linhasCa.length, linhasEspecificacao.length);
    const itens: ItemFichaEpi[] = [];
    for (let i = 0; i < total; i++) {
      const ca = digitosDaLinha(linhasCa[i]);
      const especificacao = normalizarTexto(linhasEspecificacao[i]);
      if (!ca || !especificacao) continue;
      const fabricacao = i < linhasFabricacao.length ? fabricacaoDaLinha(linhasFabricacao[i]) : null;
      itens.push({ especificacao, ca, fabricacao });
    }

    if (!itens.length) {
      return { ok: false, motivo: "Não consegui reconhecer nenhuma linha da tabela (OCR vazio)." };
    }
    return { ok: true, itens };
  } catch (err: any) {
    return { ok: false, motivo: `Falha no OCR: ${err?.message || err}` };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        /* noop */
      }
    }
  }
}
