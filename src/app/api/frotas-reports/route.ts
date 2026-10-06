import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authGuard";

// "Reports" de Gestão de Frotas (pedido do Diego, 06/10/2026) — Fase 1 da
// importação do projeto separado "Gestão de Frotas" (gestao-frotas-dashboard,
// publicado à parte na Vercel, pasta local "Gestão de Frotas" no computador
// do Diego) pra dentro de uma nova aba aqui no Controle Eolen.
//
// Esse projeto separado é só a TELA DE REVISÃO/GESTÃO pra equipe interna —
// os motoristas continuam enviando o report semanal de KM (com foto do
// odômetro) por um APP/FLUXO totalmente à parte, que grava direto na tabela
// `tb_viagem` de um Supabase PRÓPRIO desse projeto (projeto Supabase
// "ojwsnupgvgixlngxdfyg", diferente do Supabase do Controle Eolen). O pedido
// do Diego foi manter esse fluxo de envio do motorista exatamente como está
// — só a tela de gestão/revisão é que está sendo trazida pra cá.
//
// A chave abaixo é a mesma chave PÚBLICA ANON que já vinha embutida no HTML
// daquele projeto (ou seja, já era visível no navegador de qualquer um que
// abrisse a tela) — só está sendo movida pra rodar no servidor, em vez do
// cliente, seguindo o mesmo padrão do resto do Controle Eolen (o navegador
// nunca fala direto com um Supabase, só com as nossas próprias rotas). Não é
// um segredo novo sendo exposto.
const FROTAS_SUPABASE_URL = "https://ojwsnupgvgixlngxdfyg.supabase.co";
const FROTAS_SUPABASE_ANON_KEY = "sb_publishable_9JFzluB1CHAA-PP3exopTQ_CKYkGW2r";

async function frotasGet(path: string): Promise<any[]> {
  const all: any[] = [];
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const res = await fetch(`${FROTAS_SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: FROTAS_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${FROTAS_SUPABASE_ANON_KEY}`,
        Range: `${offset}-${offset + pageSize - 1}`,
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Falha ao buscar dados do projeto Gestão de Frotas (HTTP ${res.status}).`);
    const page = await res.json();
    all.push(...page);
    if (!Array.isArray(page) || page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

function stripAccents(s: any): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function normNome(s: any): string {
  return stripAccents(s).toLowerCase().trim().replace(/\s+/g, " ");
}

// Converte o timestamp UTC gravado pelo Supabase pra uma data "pura"
// (YYYY-MM-DD) no fuso de operação da frota (America/Sao_Paulo) — mesma
// lógica de toDateOnlyBR() do projeto original.
function toDateOnlyBR(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(isoTimestamp));
}

export async function GET() {
  const gate = await requirePermission("veiculos", "ver");
  if (gate.response) return gate.response;

  try {
    const [viagens, veiculos, usuarios] = await Promise.all([
      frotasGet(
        "tb_viagem?select=placa,data_criacao,hodometro,analise,id_usuario,tb_usuario(nome),tb_veiculo(contrato)&ativo=eq.1&order=data_criacao.desc"
      ),
      frotasGet("tb_veiculo?select=placa,contrato,ativo"),
      frotasGet("tb_usuario?select=nome,ativo"),
    ]);

    const reports = viagens.map((v: any) => ({
      placa: v.placa || "",
      data: toDateOnlyBR(v.data_criacao),
      km: v.hodometro || 0,
      analise: v.analise || "",
      motorista: (v.tb_usuario && v.tb_usuario.nome) || "",
      contrato: (v.tb_veiculo && v.tb_veiculo.contrato) || "",
    }));

    // placa -> {contrato, ativo} e nome normalizado -> ativo (0/1) — pra
    // badges de "veículo/motorista inativo" nas próximas fases (Histórico).
    const veiculoInfoPorPlaca: Record<string, { contrato: string; ativo: number }> = {};
    veiculos.forEach((v: any) => {
      veiculoInfoPorPlaca[v.placa] = { contrato: v.contrato || "", ativo: Number(v.ativo) || 0 };
    });
    const usuarioAtivoPorNome: Record<string, number> = {};
    usuarios.forEach((u: any) => {
      const key = normNome(u.nome);
      if (!key) return;
      const ativo = Number(u.ativo) || 0;
      if (usuarioAtivoPorNome[key] === undefined || ativo === 1) usuarioAtivoPorNome[key] = ativo;
    });

    return NextResponse.json({ reports, veiculoInfoPorPlaca, usuarioAtivoPorNome });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Falha ao buscar reports de Gestão de Frotas." }, { status: 500 });
  }
}
