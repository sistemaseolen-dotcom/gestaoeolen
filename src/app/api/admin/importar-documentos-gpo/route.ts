import { NextResponse } from "next/server";
import { requireAuth, forbidden } from "@/lib/authGuard";
import { isAdmin } from "@/lib/permissions";
import { importarDocumentosGpo } from "@/lib/gpoSync";

// Ferramenta de uso único (admin): traz os ARQUIVOS de Treinamentos/
// Documentos que ainda estão só no GPO pro Controle Eolen — ver o comentário
// grande em importarDocumentosGpo() (src/lib/gpoSync.ts) pra entender como
// cada arquivo é casado com o treinamento certo.
//
// Pedido do Diego (01/10/2026): "subir todas as documentações que estão no
// GPO e colocar em nosso sistema".
//
// Idempotente e retomável — chamar de novo só processa o que ainda falta
// (treinamentos sem arquivo_path). Processa em lote com orçamento de tempo
// pra não estourar o limite da função serverless — se não terminar tudo
// numa chamada, retorna concluido:false; quem chamou (ver app.js) chama de
// novo até concluido:true, igual ao padrão já usado em
// /api/admin/migrar-storage-antigo.
export const maxDuration = 60;

export async function GET() {
  const gate = await requireAuth();
  if (gate.response) return gate.response;
  if (!isAdmin(gate.user)) return forbidden("Só um administrador pode rodar essa importação.");

  try {
    const resumo = await importarDocumentosGpo();
    return NextResponse.json(resumo);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
