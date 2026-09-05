import { NextResponse } from "next/server";
import { requireView } from "@/lib/authGuard";

// Converte latitude/longitude em endereço — usado pra montar a marca d'água
// das fotos de Auditoria (site, horário, endereço e lat/long, igual ao app
// antigo). Roda no SERVIDOR por dois motivos: 1) a política de uso do
// Nominatim pede um User-Agent identificando a aplicação, o que não dá pra
// garantir num fetch feito direto do navegador; 2) mantém consistência com o
// padrão já usado em /api/empresas/cnpj-lookup (chamada externa sempre no
// servidor).
//
// Dois provedores gratuitos, sem chave, em cadeia: o Nominatim (OpenStreetMap)
// dá mais detalhe (rua, bairro), mas às vezes recusa/ignora chamadas vindas de
// IP de datacenter/nuvem (política de uso dele, comum em serviços hospedados
// tipo Vercel) — nesse caso ele "falha silenciosamente" (timeout ou resposta
// vazia). Cidade e estado são a parte mais importante da marca d'água, então
// se o Nominatim não devolver os dois, complementa com o BigDataCloud (feito
// especificamente pra geocodificação reversa a partir de servidor).
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const BIGDATACLOUD_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";

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

type Endereco = { via: string; bairro: string; cidade: string; uf: string; cep: string };

async function buscarViaNominatim(lat: number, lon: number): Promise<Endereco | null> {
  try {
    const res = await fetch(
      `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          // Política de uso do Nominatim exige um User-Agent identificável.
          "User-Agent": "ControleEolen/1.0 (auditorias; contato: diego.nunes@eolen.com.br)",
        },
        signal: AbortSignal.timeout(6_000),
      }
    );
    if (!res.ok) return null;
    const raw = await res.json().catch(() => null);
    const addr = raw?.address || {};

    const via = [addr.road, addr.house_number].filter(Boolean).join(", ");
    const bairro = addr.suburb || addr.neighbourhood || addr.city_district || addr.quarter || "";
    const cidade = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
    const uf = ufDoEstado(addr.state);
    const cep = addr.postcode || "";

    if (!via && !bairro && !cidade && !uf) return null;
    return { via, bairro, cidade, uf, cep };
  } catch {
    return null;
  }
}

async function buscarViaBigDataCloud(lat: number, lon: number): Promise<Endereco | null> {
  try {
    const res = await fetch(
      `${BIGDATACLOUD_URL}?latitude=${lat}&longitude=${lon}&localityLanguage=pt`,
      { method: "GET", signal: AbortSignal.timeout(6_000) }
    );
    if (!res.ok) return null;
    const raw = await res.json().catch(() => null);
    if (!raw) return null;

    const cidade = raw.city || raw.locality || "";
    const ufBruto = raw.principalSubdivision || "";
    const uf = ufDoEstado(ufBruto) || ufBruto;
    const cep = raw.postcode || "";
    const bairro = raw.locality && raw.locality !== cidade ? raw.locality : "";

    if (!cidade && !uf) return null;
    return { via: "", bairro, cidade, uf, cep };
  } catch {
    return null;
  }
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

  let r = await buscarViaNominatim(lat, lon);

  // Cidade e estado são a parte mais importante da marca d'água — se o
  // Nominatim não trouxe os dois, tenta complementar com o BigDataCloud.
  if (!r || !r.cidade || !r.uf) {
    const alt = await buscarViaBigDataCloud(lat, lon);
    if (alt) {
      r = {
        via: r?.via || "",
        bairro: r?.bairro || alt.bairro,
        cidade: r?.cidade || alt.cidade,
        uf: r?.uf || alt.uf,
        cep: r?.cep || alt.cep,
      };
    }
  }

  if (!r) return NextResponse.json({ endereco: null });

  const parte1 = [r.via, r.bairro].filter(Boolean).join(" - ");
  const parte2 = [r.cidade, r.uf].filter(Boolean).join(" - ");
  const endereco = [parte1, parte2, r.cep].filter(Boolean).join(", ") || null;

  return NextResponse.json({ endereco });
}
