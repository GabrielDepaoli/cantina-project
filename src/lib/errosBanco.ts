// Erros vindos do Supabase (PostgREST). As funções do fechamento levantam
// erros com códigos próprios CF001–CF013 (lista no topo da migration
// supabase/migrations/20261014120000_fechamento_contas.sql) e mensagens já
// escritas para o operador.

interface ErroPostgrest {
  code?: string;
  message?: string;
  details?: string | null;
}

export const codigoErro = (erro: unknown): string => (erro as ErroPostgrest | null)?.code ?? "";

// Mensagem para o toast: a do banco quando é um erro CFxxx; senão, o padrão.
export function mensagemErro(erro: unknown, padrao: string): string {
  const e = erro as ErroPostgrest | null;
  if (e?.code?.startsWith("CF") && e.message) return e.message;
  return padrao;
}

export interface DivergenciaConfirmada {
  fiador_id: string;
  saldo_atual: number;
  saldo_razao: number;
}

// CF002: a divergência mudou entre a tela e o clique. O banco devolve a lista
// atual em "details"; null quando o erro é outro ou o texto não é a lista.
export function divergenciasDoErro(erro: unknown): DivergenciaConfirmada[] | null {
  const e = erro as ErroPostgrest | null;
  if (e?.code !== "CF002" || !e.details) return null;
  try {
    const lista = JSON.parse(e.details);
    return Array.isArray(lista) ? lista : null;
  } catch {
    return null;
  }
}
