// Regra de duplicidade de cadastro de pessoa (pedido do Diego, 15/10/2026):
// não pode existir dois cadastros com o mesmo CPF, nem dois com o mesmo
// nome — serve pra eliminar duplicidade (ex.: a mesma pessoa cadastrada de
// novo por engano, muitas vezes com um ID bem mais novo — foi assim que
// achamos os ~10 pares de duplicidade já existentes no banco, de uma
// importação em lote que recriou gente que já estava cadastrada).
//
// Usado em dois lugares:
//  - POST /api/pessoas e PATCH /api/pessoas/[id] — valida de verdade antes
//    de gravar (é a regra que não pode ser burlada).
//  - POST /api/pessoas/verificar-duplicidade — mesma checagem, só pra
//    avisar ao vivo no formulário (tela de Pessoas) assim que o usuário
//    sai do campo CPF ou Nome, antes mesmo de tentar salvar.
//
// `pessoas` tem ~950 linhas hoje — trazer id/nome/cpf de todo mundo e
// comparar em JS é muito mais simples (e rápido o suficiente) do que tentar
// expressar "ignorando pontuação do CPF" num filtro do PostgREST.

export function soDigitosCpf(v: string | null | undefined): string {
  return (v || "").toString().replace(/\D/g, "");
}

export function normalizarNomePessoa(v: string | null | undefined): string {
  return (v || "")
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export type DuplicidadeAchada = { id: number; nome: string } | null;

export async function encontrarDuplicidadePessoa(
  admin: any,
  opts: { cpf?: string | null; nome?: string | null; excluirId?: number | null }
): Promise<{ cpfDuplicado: DuplicidadeAchada; nomeDuplicado: DuplicidadeAchada }> {
  const cpfDigitos = soDigitosCpf(opts.cpf);
  const nomeNorm = normalizarNomePessoa(opts.nome);
  const resultado: { cpfDuplicado: DuplicidadeAchada; nomeDuplicado: DuplicidadeAchada } = {
    cpfDuplicado: null,
    nomeDuplicado: null,
  };
  if (!cpfDigitos && !nomeNorm) return resultado;

  const { data, error } = await admin.from("pessoas").select("id, nome, cpf");
  if (error) throw error;

  for (const p of data || []) {
    if (opts.excluirId != null && p.id === opts.excluirId) continue;
    if (cpfDigitos && !resultado.cpfDuplicado && soDigitosCpf(p.cpf) === cpfDigitos) {
      resultado.cpfDuplicado = { id: p.id, nome: p.nome };
    }
    if (nomeNorm && !resultado.nomeDuplicado && normalizarNomePessoa(p.nome) === nomeNorm) {
      resultado.nomeDuplicado = { id: p.id, nome: p.nome };
    }
    if (resultado.cpfDuplicado && resultado.nomeDuplicado) break;
  }

  return resultado;
}
