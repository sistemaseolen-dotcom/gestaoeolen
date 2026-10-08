// Cookie que identifica o "dispositivo" de quem está logado (revisão de
// segurança, 10/2026 — pedido do Diego: "se a pessoa se logar de um outro
// computador ou aparelho desconhecido, vai pedir uma chave de segurança
// aleatória de 6 números enviada pro e-mail cadastrado"). Guarda só um id
// aleatório (não é fingerprint de navegador/IP — nada confiável o
// suficiente pra isso), comparado com `usuarios.dispositivo_confiavel_id`.
// Regra do Diego: só existe UM dispositivo "principal" por usuário por vez —
// autenticar com sucesso num dispositivo novo substitui o anterior.
export const DEVICE_COOKIE = "device_id";

export const DEVICE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 400, // ~400 dias — teto que os navegadores aceitam pra cookies
  path: "/",
};

// Usado só no meio-tempo entre "senha confirmada" e "código confirmado" —
// dura só o suficiente pra completar a verificação, não o acesso contínuo.
export const DEVICE_COOKIE_PENDING_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  maxAge: 60 * 30,
  path: "/",
};
