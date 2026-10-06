import { NextResponse } from "next/server";
import { requireAuth, forbidden } from "@/lib/authGuard";
import { isAdmin } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Ferramenta de uso ÚNICO (admin) — importação completa de "Gestão de
// Frotas > Veículos" do GPO (pedido do Diego, 06/10/2026): até aqui só
// importávamos os veículos com status "EM USO" (94 de 662); esta rota
// recebe TODOS os status de uma vez (EM USO, SUBSTITUÍDO, DEVOLVIDO,
// INATIVO) e faz upsert por legacy_id, preenchendo o cadastro completo.
//
// Igual à importação original (removida em d163802 junto com o resto da
// sincronização contínua): é o NAVEGADOR de quem está com a tela aberta que
// busca os dados no GPO (/v1/veiculosnovo?...&statusveic=TODOS) — o
// endpoint é lento e sem CORS restrito, então a busca lenta roda lá, e só
// os registros já prontos chegam até aqui pra um upsert rápido (cabe de
// sobra nos 60s do plano Hobby). Depois desta importação única, o sistema
// continua 100% independente do GPO — nenhuma rota daqui pra frente chama o
// GPO de novo; novos veículos/ediçoes só entram por CRUD manual mesmo (ver
// comentário em src/app/api/veiculos/route.ts).
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

// Datas do GPO vêm em "YYYY-MM-DD..." ou "DD/MM/YYYY"; "vazias" aparecem
// como sentinela 1899-12-30 — tratadas como null.
function normDate(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
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

  // Resolve condutor (texto livre + CPF do GPO) para pessoa_id já
  // cadastrado, por igualdade de CPF — heurística best-effort, igual à
  // versão original.
  const { data: pessoasRows } = await admin.from("pessoas").select("id, cpf");
  const pessoaPorCpf = new Map<string, number>();
  (pessoasRows || []).forEach((p: any) => {
    const cpf = normStr(p.cpf);
    if (cpf && !pessoaPorCpf.has(cpf)) pessoaPorCpf.set(cpf, p.id);
  });

  const payload = registros
    .map((r: any) => {
      const cpf = normStr(r.cpf);
      return {
        legacy_id: normNum(r.id),
        contrato: normStr(r.contrato),
        locadora: normUpper(r.locadora),
        placa: normUpper(r.placa),
        condutor_pessoa_id: cpf ? pessoaPorCpf.get(cpf) ?? null : null,
        condutor_nome: normUpper(r.condutor || r.nome),
        cpf,
        cnh: normStr(r.cnh),
        status: normUpper(r.status),
        km_retirada: normNum(r.kmretirada),
        km_atual: normNum(r.kmatual),
        km_devolucao: normNum(r.kmdevolucao),
        km_veiculo: normNum(r.kmveiculo),
        km_contrato: normNum(r.kmcontrato),
        km_revisao_realizada: normNum(r.kmrevisaorealizada),
        proxima_revisao_km: normStr(r.proximarevisaokm),
        observacao: normStr(r.observacao),
        projeto: normUpper(r.projeto),
        regional: normUpper(r.regional),
        coordenador: normUpper(r.coodenador),
        data_contrato: normDate(r.datacontrato),
        data_retirada: normDate(r.dataretirada),
        data_devolucao: normDate(r.datadevolucao),
        origem: "gpo",
      };
    })
    .filter((v) => v.legacy_id !== null);

  for (const batch of chunk(payload, 500)) {
    const { error } = await admin.from("veiculos").upsert(batch, { onConflict: "legacy_id" });
    if (error) {
      return NextResponse.json({ error: `Falha ao importar veículos: ${error.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ total: payload.length });
}
