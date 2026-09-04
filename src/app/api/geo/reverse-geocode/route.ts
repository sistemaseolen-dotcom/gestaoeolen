import { NextResponse } from "next/server";
import { requireView } from "@/lib/authGuard";

// Serviço público gratuito (OpenStreetMap Nominatim, sem chave) que converte
// latitude/longitude em endereço — usado pra montar a marca d'água das fotos
// de Auditoria (site, horário, endereço e lat/long, igual ao app antigo).
// Roda no SERVIDOR por dois motivos: 1) a política de uso do Nominatim pede
// um User-Agent identificando a aplicação, o que não dá pra garantir num
// fetch feito direto do navegador; 2) mantém consistência com o padrão já
// usado em /api/empresas/cnpj-lookup (chamada externa sempre no servidor).
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";

const UF_POR_ESTADO: Record<string, string> = {
  "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM", "bahia": "BA",
  "ceara": "CE", "distrito federal": "DF", "espirito santo": "ES", "goias": "GO",
  "maranhao": "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG",
  "para": "PA", "paraiba": "PB", "parana": "PR", "pernambuco": "PE", "piaui": "PI",
  "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS",
  "rondonia": "RO", "roraima": "RR", "santa catarina": "SC", "sao paulo": "SP",
  "sergipe": "SE", "tocantins": "TO",
};
function ufDoEstado(estado: string | undefined): string {
  if (!estado) return "";
  const chave = estado
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim();
  return UF_POR_ESTADO[chave] || estado;
}

export async function GET(req: Request) {
  const gate = await requireView("auditorias");
  if (gate.response) return gate.response;

  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Informe lat e lon válidos." }, { status: 400 });
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(
      `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          // Política de uso do Nominatim exige um User-Agent identificável.
          "User-Agent": "ControleEolen/1.0 (auditorias; contato: diego.nunes@eolen.com.br)",
        },
        signal: AbortSignal.timeout(8_000),
      }
    );
  } catch {
    return NextResponse.json({ endereco: null, error: "Não foi possível consultar o endereço agora." }, { status: 200 });
  }

  if (!upstreamRes.ok) {
    return NextResponse.json({ endereco: null, error: "Serviço de endereço indisponível no momento." }, { status: 200 });
  }

  const raw = await upstreamRes.json().catch(() => null);
  const addr = raw?.address || {};

  const via = [addr.road, addr.house_number].filter(Boolean).join(", ");
  const bairro = addr.suburb || addr.neighbourhood || addr.city_district || "";
  const cidade = addr.city || addr.town || addr.village || addr.municipality || "";
  const uf = ufDoEstado(addr.state);
  const cep = addr.postcode || "";

  const parte1 = [via, bairro].filter(Boolean).join(" - ");
  const parte2 = [cidade, uf].filter(Boolean).join(" - ");
  const endereco = [parte1, parte2, cep].filter(Boolean).join(", ") || null;

  return NextResponse.json({ endereco });
}
