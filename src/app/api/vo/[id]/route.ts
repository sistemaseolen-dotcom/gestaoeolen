import { NextResponse } from "next/server";
import { requireView } from "@/lib/authGuard";
import { bqQuery } from "@/lib/bigquery";

// Detalhe de uma VO (Controle de VO): todas as colunas da view, com o
// histórico de aprovação (OperationLog) e a lista de aprovadores atuais
// (CurrentApprovalHandler) já quebrados em listas para a tela.

export const dynamic = "force-dynamic";

const VO_VIEW = "`dw-eolen-413717.esupplier.vw_vo_change`";

type Row = Record<string, unknown>;

// OperationLog vem como texto, do mais recente para o mais antigo:
// "Operation:Level-3Approval,Operator:Fulano,Operation Time:2026-09-10 19:54:10,
//  Operation Result:Reject to the Submitter,Approve Comment:...;#Operation:..."
function parseOperationLog(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(";#")
    .map((part) => part.replace(/;\s*$/, ""))
    .map((part) => {
      const m = part.match(/^Operation:([\s\S]*?),Operator:([\s\S]*?),Operation Time:([\s\S]*?),Operation Result:([\s\S]*?),Approve Comment:([\s\S]*)$/);
      if (!m) return { etapa: part.trim(), operador: null, quando: null, resultado: null, comentario: null };
      return {
        etapa: m[1].trim(),
        operador: m[2].trim(),
        quando: m[3].trim(),
        resultado: m[4].trim(),
        comentario: m[5].trim() || null,
      };
    });
}

// "Jose Braga WX1030381,Antonio Augusto Mota Rodrigues 50040355" → só os
// nomes (a matrícula Huawei no fim não ajuda quem usa a tela).
function parseHandlers(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\s+[A-Za-z]{0,3}\d{5,}$/, "").trim())
    .filter(Boolean);
}

// ProofSubcontractor / ProofofChangeHW: lista JSON de anexos do eSupplier.
// Só os nomes são mostrados (os arquivos ficam no eSupplier).
function parseAnexos(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((a) => (a && (a.doc_name || a.name)) || "").filter(Boolean).map(String);
  } catch {
    return [];
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireView("vo");
  if (gate.response) return gate.response;

  const { id } = await ctx.params;
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "Número de VO inválido." }, { status: 400 });

  try {
    const rows = await bqQuery<Row>(`SELECT * FROM ${VO_VIEW} WHERE VOChangeNo = @id LIMIT 1`, [
      { name: "id", type: "INT64", value: id },
    ]);
    const r = rows[0];
    if (!r) return NextResponse.json({ error: "VO não encontrada." }, { status: 404 });
    return NextResponse.json({
      vo: r,
      historico: parseOperationLog(r.OperationLog),
      aprovadores: parseHandlers(r.CurrentApprovalHandler),
      anexosEolen: parseAnexos(r.ProofSubcontractor),
      anexosHuawei: parseAnexos(r.ProofofChangeHW),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao ler o BigQuery.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
