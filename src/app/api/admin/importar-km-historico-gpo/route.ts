import { NextResponse } from "next/server";
import { requireAuth, forbidden } from "@/lib/authGuard";
import { isAdmin } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Ferramenta de uso ÚNICO (admin) — importação do "Histórico de
// Kilometragem" do GPO (pedido do Diego, 06/10/2026), que nunca foi trazido
// antes. Mesmo padrão de importar-veiculos-gpo/route.ts: o NAVEGADOR busca
// cada leitura no GPO (/v1/veiculos/lancamento?...&paramplaca=...
// &paramcontato=...) — um request por veículo, porque o GPO não tem um
// endpoint que devolva tudo de uma vez — e manda pra cá só o resultado já
// pronto, pra um upsert em lote.
//
// Cada item do body já vem com `veiculoLegacyId` (o mesmo `id` do veículo
// usado em importar-veiculos-gpo, que o navegador já tinha em mãos ao
// buscar o histórico daquele veículo específico) — essa rota resolve esse
// id pro `veiculos.id` interno e faz upsert por legacy_id (o id do próprio
// registro de lançamento no GPO), pra poder rodar mais de uma vez sem
// duplicar. Depois desta importação única o sistema permanece 100%
// independente do GPO — novas leituras só entram manualmente, pelo botão
// "Lançar Kilometragem" (ver src/app/api/veiculos/[id]/km-lancamentos).
export const maxDuration = 60;

function normStr(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function normUpper(v: any): string | null {
  const s = normStr(v);
  return s ? s.toUpperCase() : null;
}

function normNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// dataehora do GPO vem como um instante UTC completo
// ("2026-09-24T00:00:00.000Z"), não uma data "pura" — descoberto na
// importação única (06/10/2026): usar os 10 primeiros caracteres direto
// (igual normDate de importar-veiculos-gpo, que lida com datas "puras")
// dava uma data um dia à frente do que o GPO mostra na própria tela, porque
// o GPO exibe esse instante já convertido pro horário de Brasília
// (UTC-3, sem horário de verão desde 2019). Por isso aqui SUBTRAÍMOS 3h do
// instante antes de extrair a data — só então os 10 primeiros caracteres
// batem com o que o GPO mostra (conferido contra a tela "Histórico de
// Kilometragem" de várias placas).
function normDate(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) {
    const instanteUtc = new Date(s);
    if (Number.isNaN(instanteUtc.getTime())) return null;
    const brasilia = new Date(instanteUtc.getTime() - 3 * 60 * 60 * 1000);
    const iso = brasilia.toISOString();
    const [yy, mm, dd] = iso.slice(0, 10).split("-").map(Number);
    y = yy; m = mm; d = dd;
  } else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [yy, mm, dd] = s.slice(0, 10).split("-").map(Number);
    y = yy; m = mm; d = dd;
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yy] = s.split("/").map(Number);
    y = yy; m = mm; d = dd;
  } else {
    return null;
  }
  if (!y || y <= 1900) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: Request) {
  const gate = await requireAuth();
  if (gate.response) return gate.response;
  if (!isAdmin(gate.user)) return forbidden("Só um administrador pode rodar essa importação.");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const registros = body?.registros;
  if (!Array.isArray(registros)) {
    return NextResponse.json({ error: "Nenhum registro enviado." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: veiculosRows, error: veiculosError } = await admin.from("veiculos").select("id, legacy_id");
  if (veiculosError) {
    return NextResponse.json({ error: veiculosError.message }, { status: 500 });
  }
  const idPorLegacy = new Map<number, number>();
  (veiculosRows || []).forEach((v: any) => {
    if (v.legacy_id !== null && v.legacy_id !== undefined) idPorLegacy.set(v.legacy_id, v.id);
  });

  let semVeiculo = 0;
  let semDadoValido = 0;
  const payload = registros
    .map((r: any) => {
      const veiculoLegacyId = normNum(r.veiculoLegacyId);
      const veiculoId = veiculoLegacyId !== null ? idPorLegacy.get(veiculoLegacyId) ?? null : null;
      if (veiculoId === null) {
        semVeiculo++;
        return null;
      }
      const legacyId = normNum(r.id);
      const km = normNum(r.km);
      const data = normDate(r.dataehora);
      if (legacyId === null || km === null || !data) {
        semDadoValido++;
        return null;
      }
      return {
        legacy_id: legacyId,
        veiculo_id: veiculoId,
        data_lancamento: data,
        km,
        responsavel_nome: normUpper(r.nome),
        origem: "gpo",
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  for (const batch of chunk(payload, 500)) {
    const { error } = await admin.from("veiculo_km_lancamentos").upsert(batch, { onConflict: "legacy_id" });
    if (error) {
      return NextResponse.json({ error: `Falha ao importar histórico de KM: ${error.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ total: payload.length, semVeiculo, semDadoValido });
}
