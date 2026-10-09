import { headers } from "next/headers";
import { supabaseAdmin } from "./supabaseAdmin";

// Log técnico de acessos (pedido do Diego, 10/2026): além do audit_log, que
// já registra "quem alterou o quê" (ver src/lib/audit.ts), ele quis um log
// mais técnico — IP, localização aproximada e dispositivo/navegador de cada
// ação — pra permitir rastrear de onde algo veio, caso seja preciso
// investigar no futuro.
//
// A geolocalização por IP vem de graça: a Vercel injeta automaticamente, em
// toda requisição que passa pela sua rede, um conjunto de headers
// `x-vercel-ip-*` com país/região/cidade/latitude/longitude/CEP aproximados
// do IP de origem — sem precisar de nenhuma API externa nem chave. Fora da
// Vercel (ex.: `npm run dev` local) esses headers simplesmente não existem,
// e os campos ficam null. Ver https://vercel.com/docs/edge-network/headers.

export interface InfoTecnicaRequisicao {
  ip: string | null;
  pais: string | null;
  regiao: string | null;
  cidade: string | null;
  latitude: string | null;
  longitude: string | null;
  cep: string | null;
  userAgent: string | null;
}

function decodeHeaderValue(valor: string | null): string | null {
  if (!valor) return null;
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

export async function infoTecnicaRequisicao(): Promise<InfoTecnicaRequisicao> {
  const h = await headers();

  // x-real-ip é o IP direto do cliente (setado pela Vercel); x-forwarded-for
  // pode vir com uma lista "cliente, proxy1, proxy2" — o primeiro da lista é
  // o que importa. Fora da Vercel, nenhum dos dois pode existir.
  const encaminhados = (h.get("x-forwarded-for") || "").split(",")[0].trim();
  const ip = h.get("x-real-ip") || encaminhados || null;

  return {
    ip,
    pais: decodeHeaderValue(h.get("x-vercel-ip-country")),
    regiao: decodeHeaderValue(h.get("x-vercel-ip-country-region")),
    cidade: decodeHeaderValue(h.get("x-vercel-ip-city")),
    latitude: h.get("x-vercel-ip-latitude") || null,
    longitude: h.get("x-vercel-ip-longitude") || null,
    cep: decodeHeaderValue(h.get("x-vercel-ip-postal-code")),
    userAgent: h.get("user-agent") || null,
  };
}

export interface LogAcessoOpts {
  usuarioId?: string | null;
  usuarioNome?: string | null;
  usuarioEmail?: string | null;
  acao: string;
  detalhe?: string | null;
  metodo?: string | null;
  rota?: string | null;
}

/**
 * Grava uma linha no log técnico de acessos. Nunca deixa uma falha aqui
 * derrubar a requisição original que estava sendo atendida — só loga o erro
 * no console do servidor (Vercel) e segue a vida.
 */
export async function logAcesso(opts: LogAcessoOpts): Promise<void> {
  try {
    const info = await infoTecnicaRequisicao();
    const { error } = await supabaseAdmin().from("log_acesso").insert({
      usuario_id: opts.usuarioId ?? null,
      usuario_nome: opts.usuarioNome ?? null,
      usuario_email: opts.usuarioEmail ?? null,
      acao: opts.acao,
      detalhe: opts.detalhe ?? null,
      metodo: opts.metodo ?? null,
      rota: opts.rota ?? null,
      ip: info.ip,
      pais: info.pais,
      regiao: info.regiao,
      cidade: info.cidade,
      latitude: info.latitude,
      longitude: info.longitude,
      cep: info.cep,
      user_agent: info.userAgent,
    });
    if (error) console.error("Falha ao gravar log_acesso:", error.message);
  } catch (e) {
    console.error("Falha ao gravar log_acesso:", e);
  }
}
