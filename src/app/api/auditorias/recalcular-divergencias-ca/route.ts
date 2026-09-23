import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { carregarFichasPorNome, temAlgumaDivergencia } from "@/lib/epiChecklist";

// Backfill de uma vez só (pedido do Diego, 23/09/2026): o campo
// `auditorias.tem_ca_divergente` só existe desde a migração da feature
// "Gerar ficha de EPI" e só é recalculado dentro do PATCH /api/auditorias/[id]
// — ou seja, auditorias que já existiam ANTES dessa migração (e que ninguém
// editou depois) ficaram com `tem_ca_divergente = false` por padrão, mesmo
// quando têm de fato uma divergência de CA nas respostas. Isso fazia o botão
// "Gerar ficha de EPI" não aparecer na listagem pra elas (ex.: SMCIRR4).
//
// Esta rota resolve isso rodando a mesma lógica de recálculo (epiChecklist.ts)
// contra TODAS as auditorias já existentes, de uma vez, no servidor — sem
// alterar nenhum outro dado (só a coluna `tem_ca_divergente`). É seguro
// rodar mais de uma vez (idempotente).
export async function POST() {
  const gate = await requirePermission("auditorias", "editar");
  if (gate.response) return gate.response;

  const admin = supabaseAdmin();
  const { data: auditorias, error } = await admin
    .from("auditorias")
    .select("id, site_id, status, respostas, colaboradores, tem_ca_divergente");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resultados: { id: number; siteId: string | null; antes: boolean; depois: boolean }[] = [];

  for (const a of auditorias || []) {
    const colaboradores: string[] = a.colaboradores || [];
    const fichaPorNome = await carregarFichasPorNome(admin, colaboradores);
    const divergente = temAlgumaDivergencia(a.respostas, colaboradores, fichaPorNome);
    if (divergente !== !!a.tem_ca_divergente) {
      const { error: updateError } = await admin
        .from("auditorias")
        .update({ tem_ca_divergente: divergente })
        .eq("id", a.id);
      if (updateError) {
        return NextResponse.json({ error: updateError.message, parcial: resultados }, { status: 500 });
      }
    }
    resultados.push({ id: a.id, siteId: a.site_id, antes: !!a.tem_ca_divergente, depois: divergente });
  }

  const alteradas = resultados.filter((r) => r.antes !== r.depois);
  return NextResponse.json({
    total: resultados.length,
    alteradas: alteradas.length,
    agoraComDivergencia: resultados.filter((r) => r.depois).map((r) => ({ id: r.id, siteId: r.siteId })),
  });
}
