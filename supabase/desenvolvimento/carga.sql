-- ============================================================================
-- CARGA DE DESENVOLVIMENTO — volume máximo para medir o fechamento.
-- Só roda em banco marcado como desenvolvimento e que ainda não entrou em uso.
--
-- Rode DEPOIS do seed.sql. Acrescenta, sem apagar nada:
--   - fichas "Carga NNN" em todos os números de 001 a 999 que estiverem livres
--     (com o seed: 991 fichas, total 999);
--   - 45 compras por ficha de carga, em datas aleatórias dos últimos ~130 dias;
--   - 5 pagamentos por ficha de carga;
--   - saldo_atual = razão em cada ficha de carga (sem divergência).
-- Total aproximado: 44,6 mil compras + 5 mil pagamentos.
-- Para medir: supabase/desenvolvimento/medir-fechamento.sql.
-- Para desfazer: rode seed.sql (ou reset.sql) de novo.
-- ============================================================================
BEGIN;

DO $$
BEGIN
  -- mesma guarda do seed.sql
  IF to_regclass('public._em_uso') IS NOT NULL THEN
    RAISE EXCEPTION 'Este banco está EM USO, com dados reais. carga.sql não roda aqui.';
  END IF;
  IF to_regclass('public._ambiente') IS NULL THEN
    RAISE EXCEPTION 'Banco sem a marca de desenvolvimento (rode 00-marcador.sql). Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public._ambiente WHERE nome = 'desenvolvimento') THEN
    RAISE EXCEPTION 'Banco sem a marca de desenvolvimento (rode 00-marcador.sql). Nada foi alterado.';
  END IF;
END $$;

INSERT INTO public.fiadores (numero_ficha, nome_aluno, nome_responsavel, tipo, resp1_celular)
SELECT lpad(n::text, 3, '0'), 'Carga ' || lpad(n::text, 3, '0'), 'Responsável Carga', 'dependente', '(11) 90000-0000'
FROM generate_series(1, 999) AS n
WHERE NOT EXISTS (SELECT 1 FROM public.fiadores f WHERE f.numero_ficha = lpad(n::text, 3, '0'));

-- Inserção direta (como postgres, só em desenvolvimento) para datar no passado.
INSERT INTO public.compras (fiador_id, descricao, valor, data, mes_referencia)
SELECT x.fiador_id, 'Carga', x.valor, x.quando, to_char(x.quando AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')
FROM (
  SELECT f.id AS fiador_id,
         round((2 + random() * 20)::numeric, 2) AS valor,
         now() - random() * interval '130 days' AS quando
  FROM public.fiadores f, generate_series(1, 45) AS g
  WHERE f.nome_aluno LIKE 'Carga %'
) x;

INSERT INTO public.pagamentos (fiador_id, valor, observacao, data)
SELECT f.id, round((10 + random() * 50)::numeric, 2), 'Carga', now() - random() * interval '130 days'
FROM public.fiadores f, generate_series(1, 5) AS g
WHERE f.nome_aluno LIKE 'Carga %';

-- saldo_atual = razão (Σ compras − Σ pagamentos) nas fichas de carga
UPDATE public.fiadores f SET saldo_atual =
    coalesce((SELECT sum(valor) FROM public.compras    WHERE fiador_id = f.id), 0)
  - coalesce((SELECT sum(valor) FROM public.pagamentos WHERE fiador_id = f.id), 0)
WHERE f.nome_aluno LIKE 'Carga %';

COMMIT;

SELECT (SELECT count(*) FROM public.fiadores)   AS fichas,
       (SELECT count(*) FROM public.compras)    AS compras,
       (SELECT count(*) FROM public.pagamentos) AS pagamentos,
       (SELECT count(*) FROM public.proximos_periodos() WHERE pendente) AS periodos_pendentes;
