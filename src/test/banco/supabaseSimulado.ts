// Postgres em memória (PGlite) imitando o que o Supabase já traz pronto, para
// testar o SQL do repositório sem acesso a nenhum banco real.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const PASTA_SUPABASE = path.resolve(process.cwd(), "supabase");

export const lerSql = (relativo: string) => readFileSync(path.join(PASTA_SUPABASE, relativo), "utf8");

export const migrationsEmOrdem = () =>
  readdirSync(path.join(PASTA_SUPABASE, "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => `migrations/${f}`);

// Papéis, privilégios padrão e auth.uid() como no Supabase: toda tabela e
// função nova em public nasce com ALL para anon, authenticated e service_role.
const BASE_SUPABASE = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
`;

export async function criarBanco(caminho: "setup" | "migrations" = "setup"): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(BASE_SUPABASE);
  if (caminho === "setup") {
    await db.exec(lerSql("setup-completo.sql"));
  } else {
    for (const arquivo of migrationsEmOrdem()) await db.exec(lerSql(arquivo));
  }
  return db;
}

// Volta ao banco vazio (como postgres), com o dia-âncora 6.
export async function limpar(db: PGlite) {
  await db.exec(`
    RESET ROLE;
    TRUNCATE public.periodo_divergencias, public.fechamento_itens, public.periodos_fechamento,
             public.configuracao_historico, public.pagamentos, public.compras, public.fiadores
      RESTART IDENTITY CASCADE;
    UPDATE public.configuracao SET dia_fechamento = 6;
  `);
}

// Substitui "hoje" (fuso de São Paulo) por uma data fixa. Só nos testes.
export async function fixarHoje(db: PGlite, data: string) {
  await db.exec(`CREATE OR REPLACE FUNCTION public.hoje_sp() RETURNS date LANGUAGE sql STABLE
                 SET search_path = public, pg_temp AS $$ SELECT '${data}'::date $$;`);
}

// Roda como o papel da API (anon ou authenticated) e volta para postgres.
export async function como<T>(db: PGlite, papel: "anon" | "authenticated", fn: () => Promise<T>): Promise<T> {
  await db.exec(`SET ROLE ${papel}; SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE;");
  }
}

// Erro do Postgres (código SQLSTATE e mensagem) ou null se não deu erro.
export async function erroDe(p: Promise<unknown>): Promise<{ code: string; message: string; detail?: string } | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const erro = e as { code?: string; message?: string; detail?: string };
    return { code: erro.code ?? "", message: erro.message ?? String(e), detail: erro.detail };
  }
}

// ----- dados de teste (como postgres) -----

export async function novaFicha(db: PGlite, numero: string, extra: { bloqueada?: boolean } = {}): Promise<string> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.fiadores (numero_ficha, nome_aluno, nome_responsavel, bloqueada)
     VALUES ($1, $2, 'Resp', $3) RETURNING id`,
    [numero, `Teste ${numero}`, extra.bloqueada ?? false],
  );
  return r.rows[0].id;
}

// Lançamento no passado, com data e hora de São Paulo ('2026-01-10 10:00').
// Mantém saldo_atual = razão, como as RPCs fariam.
export async function lancarCompra(db: PGlite, fichaId: string, valor: number, quandoSp: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `WITH c AS (
       INSERT INTO public.compras (fiador_id, descricao, valor, data, mes_referencia)
       VALUES ($1, 'teste', $2, ($3::timestamp AT TIME ZONE 'America/Sao_Paulo'), to_char($3::timestamp, 'YYYY-MM'))
       RETURNING id)
     UPDATE public.fiadores SET saldo_atual = saldo_atual + $2 WHERE id = $1 RETURNING (SELECT id FROM c)`,
    [fichaId, valor, quandoSp],
  );
  return r.rows[0].id;
}

export async function lancarPagamento(db: PGlite, fichaId: string, valor: number, quandoSp: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `WITH p AS (
       INSERT INTO public.pagamentos (fiador_id, valor, data)
       VALUES ($1, $2, ($3::timestamp AT TIME ZONE 'America/Sao_Paulo'))
       RETURNING id)
     UPDATE public.fiadores SET saldo_atual = saldo_atual - $2 WHERE id = $1 RETURNING (SELECT id FROM p)`,
    [fichaId, valor, quandoSp],
  );
  return r.rows[0].id;
}

export interface PeriodoLinha {
  ordem: number;
  data_inicio: string;
  data_fim: string;
  transicao: boolean;
  pendente: boolean;
}

export async function proximos(db: PGlite): Promise<PeriodoLinha[]> {
  const r = await db.query<PeriodoLinha>(
    `SELECT ordem, data_inicio::text, data_fim::text, transicao, pendente FROM public.proximos_periodos() ORDER BY ordem`,
  );
  return r.rows;
}

export async function fechar(db: PGlite, dataInicio: string, confirmadas: unknown[] = []) {
  return db.query(`SELECT * FROM public.fechar_periodo($1::date, $2::jsonb)`, [dataInicio, JSON.stringify(confirmadas)]);
}

// Fecha todos os pendentes, um por vez, do mais antigo.
export async function fecharTodos(db: PGlite) {
  for (const p of (await proximos(db)).filter((x) => x.pendente)) await fechar(db, p.data_inicio);
}
