// @vitest-environment node
// Testes do SQL do fechamento de contas (supabase/setup-completo.sql) num
// Postgres em memória. Datas em America/Sao_Paulo; dia-âncora 6, salvo
// quando o teste troca. Ver docs/plano-fechamento.md (v6), seção "Testes".
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  criarBanco, limpar, fixarHoje, como, erroDe, novaFicha, lancarCompra, lancarPagamento,
  proximos, fechar, fecharTodos, lerSql, migrationsEmOrdem,
} from "./supabaseSimulado";

const T = 60_000; // criar o banco em memória leva alguns segundos

type Item = { numero_ficha: string; saldo: number; quitado: boolean; pagamento: string | null; inicio: string };
async function itens(db: PGlite): Promise<Item[]> {
  const r = await db.query<Item>(`
    SELECT i.numero_ficha, i.saldo_congelado::float AS saldo, i.quitado_em IS NOT NULL AS quitado,
           i.quitado_por_pagamento_id::text AS pagamento, p.data_inicio::text AS inicio
    FROM fechamento_itens i JOIN periodos_fechamento p ON p.id = i.periodo_id
    ORDER BY p.data_inicio, i.numero_ficha`);
  return r.rows;
}
async function atrasos(db: PGlite): Promise<Record<string, number>> {
  const r = await db.query<{ numero_ficha: string; atraso: number }>(`
    SELECT f.numero_ficha, a.atraso FROM v_atraso_fichas a JOIN fiadores f ON f.id = a.fiador_id`);
  return Object.fromEntries(r.rows.map((x) => [x.numero_ficha, x.atraso]));
}
const umValor = async <V>(db: PGlite, sql: string, params: unknown[] = []) =>
  Object.values((await db.query<Record<string, V>>(sql, params)).rows[0])[0];

// ---------------------------------------------------------------------------
describe("períodos", () => {
  let db: PGlite;
  beforeAll(async () => { db = await criarBanco(); }, T);
  beforeEach(async () => { await limpar(db); });

  it("âncora respeita mês curto sem deslocar os meses seguintes", async () => {
    const casos: [string, number, string, string][] = [
      ["2027-02-10", 31, "2027-01-31", "2027-02-27"],
      ["2027-03-01", 31, "2027-02-28", "2027-03-30"],
      ["2026-04-15", 31, "2026-03-31", "2026-04-29"],
      ["2026-04-30", 31, "2026-04-30", "2026-05-30"],
      ["2028-02-10", 31, "2028-01-31", "2028-02-28"],
      ["2026-10-14", 6, "2026-10-06", "2026-11-05"],
      ["2026-10-05", 6, "2026-09-06", "2026-10-05"],
    ];
    for (const [data, dia, ini, fim] of casos) {
      const r = await db.query<{ i: string; f: string }>(
        "SELECT data_inicio::text AS i, data_fim::text AS f FROM periodo_de($1::date, $2::smallint)", [data, dia]);
      expect([data, dia, r.rows[0].i, r.rows[0].f]).toEqual([data, dia, ini, fim]);
    }
  });

  it("sem compra nenhuma, não há período", async () => {
    await fixarHoje(db, "2026-03-15");
    expect(await proximos(db)).toEqual([]);
  });

  it("começam no período da primeira compra e não incluem período que ainda não terminou", async () => {
    await fixarHoje(db, "2026-03-15");
    const a = await novaFicha(db, "001");
    await lancarCompra(db, a, 10, "2026-01-10 10:00");
    expect(await proximos(db)).toEqual([
      { ordem: 1, data_inicio: "2026-01-06", data_fim: "2026-02-05", transicao: false, pendente: true },
      { ordem: 2, data_inicio: "2026-02-06", data_fim: "2026-03-05", transicao: false, pendente: true },
      { ordem: 3, data_inicio: "2026-03-06", data_fim: "2026-04-05", transicao: false, pendente: false },
    ]);
  });

  it("no próprio último dia, o período ainda não pode ser fechado", async () => {
    await fixarHoje(db, "2026-03-05");
    await lancarCompra(db, await novaFicha(db, "001"), 10, "2026-02-10 10:00");
    const r = await proximos(db);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ data_fim: "2026-03-05", pendente: false });
  });

  it("compra às 23h do último dia cai no período certo (fuso de São Paulo)", async () => {
    await fixarHoje(db, "2026-02-20");
    await lancarCompra(db, await novaFicha(db, "001"), 10, "2026-02-05 23:30");
    expect((await proximos(db))[0]).toMatchObject({ data_inicio: "2026-01-06", data_fim: "2026-02-05", pendente: true });
  });
});

// ---------------------------------------------------------------------------
describe("fechamento", () => {
  let db: PGlite;
  beforeAll(async () => { db = await criarBanco(); }, T);
  beforeEach(async () => { await limpar(db); await fixarHoje(db, "2026-04-20"); });

  it("saldo congelado vem do razão no corte; item nasce quitado se o saldo zerou depois (ficha 908)", async () => {
    const a = await novaFicha(db, "908");
    await lancarCompra(db, a, 30, "2026-01-10 10:00");                 // P1 06/01–05/02
    const pag = await lancarPagamento(db, a, 30, "2026-02-10 10:00");  // P2 06/02–05/03
    await lancarCompra(db, a, 25, "2026-03-10 10:00");                 // P3 06/03–05/04
    await fecharTodos(db);
    expect(await itens(db)).toEqual([
      { numero_ficha: "908", saldo: 30, quitado: true, pagamento: pag, inicio: "2026-01-06" },
      { numero_ficha: "908", saldo: 25, quitado: false, pagamento: null, inicio: "2026-03-06" },
    ]);
    expect(await atrasos(db)).toEqual({ "908": 1 });
  });

  it("dois fechamentos em sequência gravam valores diferentes; atraso conta desde o mais antigo", async () => {
    const a = await novaFicha(db, "001");
    await lancarCompra(db, a, 10, "2026-01-10 10:00");
    await lancarCompra(db, a, 5, "2026-02-10 10:00");
    await fecharTodos(db);
    expect((await itens(db)).map((i) => [i.inicio, i.saldo, i.quitado])).toEqual([
      ["2026-01-06", 10, false], ["2026-02-06", 15, false], ["2026-03-06", 15, false],
    ]);
    expect(await atrasos(db)).toEqual({ "001": 3 });
  });

  it("ficha sem dívida no corte, ficha criada depois e período sem devedores não geram item", async () => {
    const a = await novaFicha(db, "001");
    await lancarCompra(db, a, 10, "2026-01-10 10:00");
    await lancarPagamento(db, a, 10, "2026-01-20 10:00");
    await fechar(db, "2026-01-06");
    expect(await itens(db)).toEqual([]);
    expect(await umValor(db, "SELECT count(*)::int FROM periodos_fechamento")).toBe(1);
  });

  it("ficha bloqueada também entra no fechamento", async () => {
    await lancarCompra(db, await novaFicha(db, "002", { bloqueada: true }), 10, "2026-01-10 10:00");
    await fechar(db, "2026-01-06");
    expect((await itens(db)).map((i) => i.numero_ficha)).toEqual(["002"]);
  });

  it("prévia mostra o período, o número de fichas e o total que será congelado", async () => {
    await lancarCompra(db, await novaFicha(db, "001"), 10, "2026-01-10 10:00");
    await lancarCompra(db, await novaFicha(db, "002"), 7.5, "2026-01-11 10:00");
    await novaFicha(db, "003");
    const r = await db.query("SELECT data_inicio::text, data_fim::text, transicao, fichas, total::float FROM previa_fechamento()");
    expect(r.rows).toEqual([{ data_inicio: "2026-01-06", data_fim: "2026-02-05", transicao: false, fichas: 2, total: 17.5 }]);
  });

  it("clique duplo dá 'Período já fechado'; fora de ordem e sem pendente também recusam", async () => {
    await lancarCompra(db, await novaFicha(db, "001"), 10, "2026-01-10 10:00");
    expect((await erroDe(fechar(db, "2026-02-06")))?.code).toBe("CF006");
    await fechar(db, "2026-01-06");
    expect((await erroDe(fechar(db, "2026-01-06")))?.code).toBe("CF003");
    await fechar(db, "2026-02-06");
    await fechar(db, "2026-03-06");
    expect((await erroDe(fechar(db, "2026-04-06")))?.code).toBe("CF005");
  });

  it("cadeia sem buraco nem sobreposição; INSERT manual que quebra a cadeia é rejeitado", async () => {
    await lancarCompra(db, await novaFicha(db, "001"), 10, "2026-01-10 10:00");
    await fecharTodos(db);
    const buracos = await umValor(db, `
      SELECT count(*)::int FROM (
        SELECT data_inicio, lag(data_fim) OVER (ORDER BY data_inicio) AS fim_anterior FROM periodos_fechamento) x
      WHERE fim_anterior IS NOT NULL AND data_inicio <> fim_anterior + 1`);
    expect(buracos).toBe(0);
    const ultimo = await umValor<string>(db, "SELECT id::text FROM periodos_fechamento ORDER BY data_inicio DESC LIMIT 1");
    expect(await erroDe(db.query(
      `INSERT INTO periodos_fechamento (periodo_anterior_id, data_inicio, data_fim, dia_ancora) VALUES ($1, '2026-04-10', '2026-05-05', 6)`,
      [ultimo]))).not.toBeNull(); // buraco
    expect(await erroDe(db.query(
      `INSERT INTO periodos_fechamento (periodo_anterior_id, data_inicio, data_fim, dia_ancora) VALUES ($1, '2026-04-01', '2026-05-05', 6)`,
      [ultimo]))).not.toBeNull(); // sobreposição
    expect(await erroDe(db.query(
      `INSERT INTO periodos_fechamento (periodo_anterior_id, data_inicio, data_fim, dia_ancora) VALUES (NULL, '2026-04-06', '2026-05-05', 6)`,
    ))).not.toBeNull(); // segunda raiz
  });

  describe("divergência razão × saldo", () => {
    let a: string;
    beforeEach(async () => {
      a = await novaFicha(db, "001");
      await lancarCompra(db, a, 10, "2026-01-10 10:00");
      await db.query("UPDATE fiadores SET saldo_atual = 12 WHERE id = $1", [a]); // corrompe o saldo
    });

    it("conferência avulsa lista a ficha e não altera nada", async () => {
      const antes = await db.query("SELECT saldo_atual, updated_at FROM fiadores ORDER BY id");
      const r = await db.query("SELECT numero_ficha, saldo_atual::float, saldo_razao::float FROM verificar_divergencias()");
      expect(r.rows).toEqual([{ numero_ficha: "001", saldo_atual: 12, saldo_razao: 10 }]);
      expect((await db.query("SELECT saldo_atual, updated_at FROM fiadores ORDER BY id")).rows).toEqual(antes.rows);
    });

    it("fechamento recusa sem confirmação e devolve a lista atual", async () => {
      const e = await erroDe(fechar(db, "2026-01-06"));
      expect(e?.code).toBe("CF002");
      expect(JSON.parse(e!.detail!)).toEqual([{ fiador_id: a, saldo_atual: 12, saldo_razao: 10 }]);
      expect(await umValor(db, "SELECT count(*)::int FROM periodos_fechamento")).toBe(0);
    });

    it("confirmação idêntica fecha e registra a divergência; lista diferente recusa de novo", async () => {
      const vista = [{ fiador_id: a, saldo_atual: 12, saldo_razao: 10 }];
      await db.query("UPDATE fiadores SET saldo_atual = 13 WHERE id = $1", [a]); // mudou entre a tela e o clique
      expect((await erroDe(fechar(db, "2026-01-06", vista)))?.code).toBe("CF002");
      await fechar(db, "2026-01-06", [{ fiador_id: a, saldo_atual: "13.00", saldo_razao: 10 }]);
      const r = await db.query("SELECT numero_ficha, saldo_atual::float, saldo_razao::float FROM periodo_divergencias");
      expect(r.rows).toEqual([{ numero_ficha: "001", saldo_atual: 13, saldo_razao: 10 }]);
      expect((await itens(db)).map((i) => i.saldo)).toEqual([10]); // item usa o razão
    });

    it("confirmar divergência que não existe também recusa", async () => {
      await db.query("UPDATE fiadores SET saldo_atual = 10 WHERE id = $1", [a]);
      expect((await erroDe(fechar(db, "2026-01-06", [{ fiador_id: a, saldo_atual: 12, saldo_razao: 10 }])))?.code).toBe("CF002");
    });
  });

  describe("quitação pelo pagamento", () => {
    let a: string;
    const pagar = (valor: number) =>
      como(db, "authenticated", () => db.query("SELECT * FROM registrar_pagamento($1, $2)", [a, valor]));
    beforeEach(async () => {
      a = await novaFicha(db, "001");
      await lancarCompra(db, a, 10, "2026-01-10 10:00");
      await lancarCompra(db, a, 5, "2026-02-10 10:00");
      await fechar(db, "2026-01-06");
      await fechar(db, "2026-02-06"); // 2 itens abertos: 10 e 15; saldo 15
    });

    it("pagamento parcial passa sem erro e não quita nada", async () => {
      await pagar(5);
      expect(await umValor(db, "SELECT saldo_atual::float FROM fiadores")).toBe(10);
      expect((await itens(db)).map((i) => i.quitado)).toEqual([false, false]);
    });

    it("pagamento que zera o saldo quita todos os itens abertos", async () => {
      await pagar(15);
      const pag = await umValor<string>(db, "SELECT id::text FROM pagamentos");
      expect((await itens(db)).map((i) => [i.quitado, i.pagamento])).toEqual([[true, pag], [true, pag]]);
      expect(await atrasos(db)).toEqual({});
    });

    it("pagamento que deixa crédito também quita todos", async () => {
      await pagar(20);
      expect(await umValor(db, "SELECT saldo_atual::float FROM fiadores")).toBe(-5);
      expect((await itens(db)).every((i) => i.quitado)).toBe(true);
    });

    it("pagamento parcial em ficha sem item nenhum passa", async () => {
      const b = await novaFicha(db, "002");
      await lancarCompra(db, b, 10, "2026-04-15 10:00");
      await como(db, "authenticated", () => db.query("SELECT * FROM registrar_pagamento($1, 3)", [b]));
      expect(await umValor(db, "SELECT saldo_atual::float FROM fiadores WHERE id = $1", [b])).toBe(7);
    });

    it("ficha com item aberto não pode ser excluída; depois de quitada, pode, e o histórico fica", async () => {
      const e = await erroDe(como(db, "authenticated", () => db.query("DELETE FROM fiadores WHERE id = $1", [a])));
      expect(e?.code).toBe("CF001");
      await pagar(15);
      await como(db, "authenticated", () => db.query("DELETE FROM fiadores WHERE id = $1", [a]));
      const r = await db.query("SELECT fiador_id, numero_ficha, nome_aluno FROM fechamento_itens");
      expect(r.rows).toEqual([
        { fiador_id: null, numero_ficha: "001", nome_aluno: "Teste 001" },
        { fiador_id: null, numero_ficha: "001", nome_aluno: "Teste 001" },
      ]);
    });

    it("pagamento para ficha inexistente recusa sem gravar nada", async () => {
      const e = await erroDe(como(db, "authenticated", () =>
        db.query("SELECT * FROM registrar_pagamento('00000000-0000-0000-0000-000000000099', 5)")));
      expect(e?.code).toBe("CF007");
      expect(await umValor(db, "SELECT count(*)::int FROM pagamentos")).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
describe("troca do dia-âncora", () => {
  let db: PGlite;
  const simular = async (dia: number) =>
    (await db.query<{ s: Record<string, unknown> }>("SELECT simular_troca_dia($1::smallint) AS s", [dia])).rows[0].s;
  const definir = (dia: number, confirmar = false) =>
    db.query("SELECT * FROM definir_dia_fechamento($1::smallint, $2)", [dia, confirmar]);

  beforeAll(async () => { db = await criarBanco(); }, T);
  beforeEach(async () => {
    await limpar(db);
    await fixarHoje(db, "2026-04-10");
    await lancarCompra(db, await novaFicha(db, "001"), 10, "2026-01-10 10:00");
  });

  it("bloqueada com período pendente, listando os períodos", async () => {
    const s = await simular(20);
    expect(s.bloqueado).toBe(true);
    const e = await erroDe(definir(20));
    expect(e?.code).toBe("CF008");
    expect(e?.message).toContain("Há 3 período(s) pendente(s): 06/01–05/02, 06/02–05/03, 06/03–05/04");
  });

  it("sem pendentes: mostra a transição, grava o histórico e não mexe no que já foi fechado", async () => {
    await fecharTodos(db);
    const antes = (await db.query("SELECT * FROM periodos_fechamento ORDER BY data_inicio")).rows;
    const itensAntes = await itens(db);
    expect(await simular(20)).toMatchObject({
      bloqueado: false, transicao_inicio: "2026-04-06", transicao_fim: "2026-04-19", dias: 14,
      sem_transicao: false, aviso_curta: false,
    });
    await definir(20);
    expect(await umValor(db, "SELECT dia_fechamento FROM configuracao")).toBe(20);
    const h = await db.query("SELECT dia_anterior, dia_novo, transicao_inicio::text, transicao_fim::text FROM configuracao_historico");
    expect(h.rows).toEqual([{ dia_anterior: 6, dia_novo: 20, transicao_inicio: "2026-04-06", transicao_fim: "2026-04-19" }]);
    expect((await db.query("SELECT * FROM periodos_fechamento ORDER BY data_inicio")).rows).toEqual(antes);
    expect(await itens(db)).toEqual(itensAntes);
    expect((await proximos(db))[0]).toMatchObject({ data_inicio: "2026-04-06", data_fim: "2026-04-19", transicao: true, pendente: false });
  });

  it("segunda troca bloqueada até a transição ser fechada; cadeia continua sem buraco", async () => {
    await fecharTodos(db);
    await definir(20);
    const e = await erroDe(definir(25));
    expect(e?.code).toBe("CF009");
    expect(e?.message).toBe(
      "A troca anterior (dia 6 → 20) gerou a transição 06/04–19/04, que ainda não foi fechada. Feche-a quando terminar (a partir de 20/04) e então troque o dia.");

    await fixarHoje(db, "2026-04-25");
    await fechar(db, "2026-04-06");
    expect((await db.query("SELECT transicao, dia_ancora, data_fim::text FROM periodos_fechamento WHERE data_inicio = '2026-04-06'")).rows)
      .toEqual([{ transicao: true, dia_ancora: 20, data_fim: "2026-04-19" }]);
    expect((await proximos(db))[0]).toMatchObject({ data_inicio: "2026-04-20", data_fim: "2026-05-19", transicao: false });
    await definir(25, true); // agora pode (transição 20/04–24/04, curta: confirma o aviso)
    const buracos = await umValor(db, `
      SELECT count(*)::int FROM (
        SELECT data_inicio, lag(data_fim) OVER (ORDER BY data_inicio) AS fim_anterior FROM periodos_fechamento) x
      WHERE fim_anterior IS NOT NULL AND data_inicio <> fim_anterior + 1`);
    expect(buracos).toBe(0);
  });

  it("transição com menos de 7 dias exige confirmar o aviso", async () => {
    await fecharTodos(db);
    expect(await simular(8)).toMatchObject({ transicao_inicio: "2026-04-06", transicao_fim: "2026-04-07", dias: 2, aviso_curta: true });
    expect((await erroDe(definir(8)))?.code).toBe("CF010");
    await definir(8, true);
    expect(await umValor(db, "SELECT aviso_confirmado FROM configuracao_historico")).toBe(true);
  });

  it("sem nenhum período fechado não há transição; mesmo dia e dia inválido recusam", async () => {
    await fixarHoje(db, "2026-01-20");
    expect(await simular(20)).toMatchObject({ bloqueado: false, sem_transicao: true, transicao_inicio: null });
    expect((await erroDe(definir(6)))?.code).toBe("CF012");
    expect((await erroDe(definir(32)))?.code).toBe("CF011");
    await definir(20);
    expect((await proximos(db))[0]).toMatchObject({ data_inicio: "2025-12-20", transicao: false });
  });
});

// ---------------------------------------------------------------------------
describe("permissões (como a API do app)", () => {
  let db: PGlite;
  let a: string;
  beforeAll(async () => { db = await criarBanco(); }, T);
  beforeEach(async () => {
    await limpar(db);
    await fixarHoje(db, "2026-04-20");
    a = await novaFicha(db, "001");
  });

  const negado = async (papel: "anon" | "authenticated", sql: string, params: unknown[] = []) => {
    const e = await erroDe(como(db, papel, () => db.query(sql, params)));
    expect(e?.message, sql).toMatch(/permission denied/);
  };

  it("anon não executa nenhuma RPC", async () => {
    await negado("anon", "SELECT registrar_compra($1, 'x', 1, '2026-04')", [a]);
    await negado("anon", "SELECT registrar_pagamento($1, 1)", [a]);
    await negado("anon", "SELECT fechar_periodo('2026-01-06')");
    await negado("anon", "SELECT definir_dia_fechamento(10::smallint)");
  });

  it("authenticated vende, paga e fecha pelas RPCs", async () => {
    await como(db, "authenticated", async () => {
      await db.query("SELECT registrar_compra($1, 'x', 10, '2026-04')", [a]);
      await db.query("SELECT registrar_pagamento($1, 4)", [a]);
    });
    expect(await umValor(db, "SELECT saldo_atual::float FROM fiadores")).toBe(6);
    await lancarCompra(db, a, 10, "2026-01-10 10:00");
    await como(db, "authenticated", () => db.query("SELECT fechar_periodo('2026-01-06')"));
    expect(await como(db, "authenticated", () => umValor(db, "SELECT count(*)::int FROM fechamento_itens"))).toBe(1);
  });

  it("authenticated não escreve saldo, razão nem fechamento direto", async () => {
    await negado("authenticated", "UPDATE fiadores SET saldo_atual = 0 WHERE id = $1", [a]);
    await negado("authenticated", "INSERT INTO fiadores (numero_ficha, nome_aluno, nome_responsavel, saldo_atual) VALUES ('002','x','y',5)");
    await negado("authenticated", "INSERT INTO compras (fiador_id, descricao, valor, mes_referencia) VALUES ($1,'x',1,'2026-04')", [a]);
    await negado("authenticated", "DELETE FROM compras");
    await negado("authenticated", "INSERT INTO pagamentos (fiador_id, valor) VALUES ($1, 1)", [a]);
    await negado("authenticated", "UPDATE fechamento_itens SET quitado_em = now()");
    await negado("authenticated", "UPDATE configuracao SET dia_fechamento = 10");
    await negado("authenticated", "INSERT INTO periodos_fechamento (data_inicio, data_fim, dia_ancora) VALUES ('2026-01-06','2026-02-05',6)");
  });

  it("authenticated continua criando, editando e excluindo ficha pelas colunas do app", async () => {
    await como(db, "authenticated", async () => {
      await db.query(`INSERT INTO fiadores (numero_ficha, nome_aluno, nome_responsavel, tipo, resp1_celular, resp1_cpf,
                        resp2_nome, resp2_celular, resp2_cpf) VALUES ('002','Nova','Resp','dependente',null,null,null,null,null)`);
      await db.query(`UPDATE fiadores SET nome_aluno = 'Editado', observacoes = 'nota', bloqueada = true,
                        somente_credito = true WHERE numero_ficha = '002'`);
      await db.query("DELETE FROM fiadores WHERE numero_ficha = '002'");
    });
    expect(await umValor(db, "SELECT count(*)::int FROM fiadores")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe("arquivos SQL do repositório", () => {
  it("setup-completo.sql contém a última migration sem alteração", () => {
    const normalizar = (s: string) => s.replace(/\r\n/g, "\n");
    const ultima = migrationsEmOrdem().at(-1)!;
    expect(normalizar(lerSql("setup-completo.sql"))).toContain(normalizar(lerSql(ultima)));
  });

  it("aplicar as migrations em ordem sobre o banco antigo funciona e remove o fechamento antigo", async () => {
    const db = await criarBanco("migrations");
    expect(await umValor(db, "SELECT to_regclass('public.fechamentos')")).toBeNull();
    expect(await umValor(db, "SELECT count(*)::int FROM pg_proc WHERE proname = 'fechar_mes'")).toBe(0);
    expect(await umValor(db, "SELECT bool_and(prosecdef) FROM pg_proc WHERE proname IN ('registrar_compra','registrar_pagamento')")).toBe(true);
  }, T);

  it("seed + fechar os 4 períodos pelo fluxo real dá os atrasos da tabela do LEIAME", async () => {
    const db = await criarBanco();
    await db.exec(lerSql("desenvolvimento/00-marcador.sql"));
    await db.exec(lerSql("desenvolvimento/seed.sql"));
    expect((await proximos(db)).filter((p) => p.pendente)).toHaveLength(4);
    await fecharTodos(db);
    expect(await atrasos(db)).toEqual({ "903": 1, "904": 2, "905": 4, "906": 4, "907": 2, "908": 2 });
    const p1 = await db.query<{ quitado: boolean }>(`
      SELECT i.quitado_em IS NOT NULL AS quitado FROM fechamento_itens i
      JOIN periodos_fechamento p ON p.id = i.periodo_id WHERE i.numero_ficha = '908' ORDER BY p.data_inicio LIMIT 1`);
    expect(p1.rows[0].quitado).toBe(true);
    expect(await umValor(db, "SELECT count(*)::int FROM verificar_divergencias()")).toBe(0);
  }, T);
});
