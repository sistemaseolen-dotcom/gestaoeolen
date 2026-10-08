import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { supabaseServerSession } from "@/lib/supabaseServerSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEVICE_COOKIE, DEVICE_COOKIE_OPTIONS } from "@/lib/deviceCookie";

// Confirma o código de 6 números mandado por e-mail quando o login veio de
// um dispositivo desconhecido (ver POST /api/auth/login). Lê a sessão do
// Supabase Auth direto (não via getCurrentUser()) porque é justamente esta
// rota que resolve a pendência do gate de dispositivo.
const MAX_TENTATIVAS = 5;

export async function POST(req: Request) {
  const sessionClient = await supabaseServerSession();
  const {
    data: { user: authUser },
  } = await sessionClient.auth.getUser();
  if (!authUser) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const codigo = (body?.codigo || "").toString().trim();
  if (!codigo) {
    return NextResponse.json({ error: "Informe o código recebido por e-mail." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const deviceId = cookieStore.get(DEVICE_COOKIE)?.value;
  if (!deviceId) {
    return NextResponse.json({ error: "Sessão de verificação expirada. Faça login novamente." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: registro } = await admin
    .from("login_verificacoes")
    .select("id, codigo_hash, tentativas, expira_em")
    .eq("usuario_id", authUser.id)
    .eq("device_id", deviceId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!registro || new Date(registro.expira_em).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Código expirado. Peça um novo código." }, { status: 400 });
  }

  if (registro.tentativas >= MAX_TENTATIVAS) {
    return NextResponse.json({ error: "Muitas tentativas incorretas. Peça um novo código." }, { status: 429 });
  }

  const codigoHash = crypto.createHash("sha256").update(codigo).digest("hex");
  if (codigoHash !== registro.codigo_hash) {
    await admin.from("login_verificacoes").update({ tentativas: registro.tentativas + 1 }).eq("id", registro.id);
    return NextResponse.json({ error: "Código inválido." }, { status: 401 });
  }

  // Código certo — este dispositivo passa a ser o "principal" do usuário,
  // substituindo o anterior (regra do Diego: só um dispositivo confiável
  // por vez).
  const agora = new Date().toISOString();
  await admin
    .from("usuarios")
    .update({ dispositivo_confiavel_id: deviceId, dispositivo_atualizado_em: agora, ultimo_login_em: agora })
    .eq("id", authUser.id);

  await admin.from("login_verificacoes").delete().eq("id", registro.id);

  const { data: perfil } = await admin
    .from("usuarios")
    .select("id, nome, email, role, ativo, permissoes, must_change_password")
    .eq("id", authUser.id)
    .maybeSingle();

  const response = NextResponse.json({ usuario: perfil });
  response.cookies.set(DEVICE_COOKIE, deviceId, DEVICE_COOKIE_OPTIONS);
  return response;
}
