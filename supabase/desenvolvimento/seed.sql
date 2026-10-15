-- ============================================================================
-- SEED DE DESENVOLVIMENTO — fichas e lançamentos de teste para o fechamento.
-- Só roda em banco marcado como desenvolvimento (ver 00-marcador.sql) e que
-- ainda não entrou em uso.
--
-- Rodar de novo sempre volta ao MESMO estado: o seed começa com o reset.
-- As datas são relativas a HOJE (fuso America/Sao_Paulo), então o seed não
-- envelhece. Nenhum dado real: fichas 901–908, nomes "Teste ...".
--
-- Períodos (dia-âncora 6 por padrão; usa configuracao.dia_fechamento quando a
-- tabela existir, a partir da etapa 1 do plano v6):
--   P1..P4 = os 4 períodos JÁ ENCERRADOS mais recentes (P4 = o mais recente).
--   Cada lançamento cai no 2º dia do período, às 10:00 de São Paulo, ou seja,
--   antes do corte daquele período.
-- O seed NÃO fecha nenhum período: os 4 pendentes são fechados pelo botão.
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------- guarda + reset
DO $$
DECLARE
  v_tabelas text;
BEGIN
  -- mesma guarda do reset.sql
  IF to_regclass('public._em_uso') IS NOT NULL THEN
    RAISE EXCEPTION 'Este banco está EM USO, com dados reais. seed.sql não roda mais aqui.';
  END IF;
  IF to_regclass('public._ambiente') IS NULL THEN
    RAISE EXCEPTION 'Banco sem a marca de desenvolvimento (rode 00-marcador.sql). Nada foi apagado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public._ambiente WHERE nome = 'desenvolvimento') THEN
    RAISE EXCEPTION 'Banco sem a marca de desenvolvimento (rode 00-marcador.sql). Nada foi apagado.';
  END IF;

  -- mesma lógica do reset.sql
  SELECT string_agg(format('public.%I', t), ', ')
    INTO v_tabelas
    FROM unnest(ARRAY[
      'periodo_divergencias', 'fechamento_itens', 'periodos_fechamento',
      'configuracao_historico', 'fechamentos', 'pagamentos', 'compras', 'fiadores'
    ]) AS t
   WHERE to_regclass(format('public.%I', t)) IS NOT NULL;

  EXECUTE 'TRUNCATE ' || v_tabelas || ' RESTART IDENTITY CASCADE';

  IF to_regclass('public.configuracao') IS NOT NULL THEN
    EXECUTE 'UPDATE public.configuracao SET dia_fechamento = 6, atualizado_em = now()';
  END IF;
END $$;

-- ---------------------------------------------------------------- funções auxiliares (só desta sessão)
-- Âncora do mês: o dia configurado, ou o último dia do mês se ele não existir.
CREATE OR REPLACE FUNCTION pg_temp.ancora(p_mes date, p_dia int) RETURNS date
LANGUAGE sql IMMUTABLE AS $$
  SELECT make_date(
    extract(year FROM p_mes)::int,
    extract(month FROM p_mes)::int,
    least(p_dia, extract(day FROM (date_trunc('month', p_mes) + interval '1 month - 1 day'))::int)
  )
$$;

-- 2º dia do período, 10:00 em São Paulo.
CREATE OR REPLACE FUNCTION pg_temp.momento(p_inicio date) RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$
  SELECT ((p_inicio + 1) + time '10:00') AT TIME ZONE 'America/Sao_Paulo'
$$;

-- IF NOT EXISTS + TRUNCATE: o seed pode rodar mais de uma vez na mesma sessão.
CREATE TEMP TABLE IF NOT EXISTS seed_resumo (ordem int, item text, detalhe text);
TRUNCATE seed_resumo;

-- ---------------------------------------------------------------- dados
DO $$
DECLARE
  v_dia          int  := 6;
  v_hoje         date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ancora_mes   date;
  v_inicio_atual date;
  p1 date; p2 date; p3 date; p4 date;  -- inícios; P4 = encerrado mais recente
BEGIN
  IF to_regclass('public.configuracao') IS NOT NULL THEN
    EXECUTE 'SELECT dia_fechamento FROM public.configuracao' INTO v_dia;
  END IF;

  v_ancora_mes := pg_temp.ancora(v_hoje, v_dia);
  IF v_hoje >= v_ancora_mes THEN
    v_inicio_atual := v_ancora_mes;
  ELSE
    v_inicio_atual := pg_temp.ancora((date_trunc('month', v_hoje) - interval '1 month')::date, v_dia);
  END IF;

  p4 := pg_temp.ancora((date_trunc('month', v_inicio_atual) - interval '1 month')::date, v_dia);
  p3 := pg_temp.ancora((date_trunc('month', v_inicio_atual) - interval '2 months')::date, v_dia);
  p2 := pg_temp.ancora((date_trunc('month', v_inicio_atual) - interval '3 months')::date, v_dia);
  p1 := pg_temp.ancora((date_trunc('month', v_inicio_atual) - interval '4 months')::date, v_dia);

  INSERT INTO public.fiadores (numero_ficha, nome_aluno, nome_responsavel, tipo, resp1_celular, bloqueada, observacoes) VALUES
    ('901', 'Teste 901 — Normal',                   'Responsável Teste', 'dependente', '(11) 90000-0901', false, NULL),
    ('902', 'Teste 902 — Bloqueada sem atraso',     'Responsável Teste', 'dependente', '(11) 90000-0902', true,  NULL),
    ('903', 'Teste 903 — Atraso 1',                 'Responsável Teste', 'dependente', '(11) 90000-0903', false, NULL),
    ('904', 'Teste 904 — Atraso 2',                 'Responsável Teste', 'dependente', '(11) 90000-0904', false, NULL),
    ('905', 'Teste 905 — Atraso 3+',                'Responsável Teste', 'dependente', '(11) 90000-0905', false, NULL),
    ('906', 'Teste 906 — Bloqueada e atraso 3+',    'Responsável Teste', 'dependente', '(11) 90000-0906', true,  NULL),
    ('907', 'Teste 907 — Anotação e atraso 2',      'Responsável Teste', 'dependente', '(11) 90000-0907', false,
            'Só pode comprar salgado assado (anotação de teste)'),
    ('908', 'Teste 908 — Quitou e voltou a dever',  'Responsável Teste', 'dependente', '(11) 90000-0908', false, NULL);

  -- Inserção direta (como postgres, só em desenvolvimento) para poder datar no passado.
  -- O saldo_atual é acertado no fim, para o razão e o saldo baterem.
  INSERT INTO public.compras (fiador_id, descricao, valor, data, mes_referencia)
  SELECT f.id, x.descricao, x.valor, x.quando,
         to_char(x.quando AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')
  FROM (VALUES
    ('901', 'Seed: compra no período corrente', 15.00, now()),
    ('903', 'Seed: compra em P4',               20.00, pg_temp.momento(p4)),
    ('904', 'Seed: compra em P3',               18.00, pg_temp.momento(p3)),
    ('905', 'Seed: compra em P1',               40.00, pg_temp.momento(p1)),
    ('906', 'Seed: compra em P1',               35.00, pg_temp.momento(p1)),
    ('907', 'Seed: compra em P3',               12.50, pg_temp.momento(p3)),
    ('908', 'Seed: compra em P1',               30.00, pg_temp.momento(p1)),
    ('908', 'Seed: compra em P3',               25.00, pg_temp.momento(p3))
  ) AS x(numero, descricao, valor, quando)
  JOIN public.fiadores f ON f.numero_ficha = x.numero;

  INSERT INTO public.pagamentos (fiador_id, valor, observacao, data)
  SELECT f.id, x.valor, x.observacao, x.quando
  FROM (VALUES
    ('908', 30.00, 'Seed: pagamento que zera em P2', pg_temp.momento(p2))
  ) AS x(numero, valor, observacao, quando)
  JOIN public.fiadores f ON f.numero_ficha = x.numero;

  -- saldo_atual = razão (Σ compras − Σ pagamentos) em todas as fichas do seed
  UPDATE public.fiadores f SET saldo_atual =
      coalesce((SELECT sum(valor) FROM public.compras    WHERE fiador_id = f.id), 0)
    - coalesce((SELECT sum(valor) FROM public.pagamentos WHERE fiador_id = f.id), 0);

  INSERT INTO seed_resumo VALUES
    (1, 'Dia-âncora', v_dia::text),
    (2, 'P1', to_char(p1, 'DD/MM/YYYY') || ' a ' || to_char(p2 - 1, 'DD/MM/YYYY')),
    (3, 'P2', to_char(p2, 'DD/MM/YYYY') || ' a ' || to_char(p3 - 1, 'DD/MM/YYYY')),
    (4, 'P3', to_char(p3, 'DD/MM/YYYY') || ' a ' || to_char(p4 - 1, 'DD/MM/YYYY')),
    (5, 'P4', to_char(p4, 'DD/MM/YYYY') || ' a ' || to_char(v_inicio_atual - 1, 'DD/MM/YYYY')),
    (6, 'Período corrente', 'desde ' || to_char(v_inicio_atual, 'DD/MM/YYYY') || ' (não fecha ainda)');
END $$;

-- Conferência: o seed não pode deixar divergência entre razão e saldo.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fiadores f
    WHERE f.saldo_atual <>
        coalesce((SELECT sum(valor) FROM public.compras    WHERE fiador_id = f.id), 0)
      - coalesce((SELECT sum(valor) FROM public.pagamentos WHERE fiador_id = f.id), 0)
  ) THEN
    RAISE EXCEPTION 'Seed deixou divergência entre razão e saldo — abortando.';
  END IF;
END $$;

INSERT INTO seed_resumo
SELECT 10 + row_number() OVER (ORDER BY numero_ficha),
       '#' || numero_ficha || ' ' || nome_aluno,
       'saldo_atual = ' || saldo_atual || CASE WHEN bloqueada THEN ' · bloqueada' ELSE '' END
         || CASE WHEN observacoes IS NOT NULL THEN ' · com anotação' ELSE '' END
FROM public.fiadores;

COMMIT;

-- Resumo: os períodos calculados para hoje e as fichas criadas.
SELECT item, detalhe FROM seed_resumo ORDER BY ordem;
