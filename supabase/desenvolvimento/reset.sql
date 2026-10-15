-- ============================================================================
-- RESET DE DESENVOLVIMENTO — apaga TODOS os dados do app neste banco.
-- Só roda em banco marcado como desenvolvimento (ver 00-marcador.sql) e que
-- ainda não entrou em uso; em qualquer outro banco ele aborta sem tocar em nada.
--
-- Use para voltar ao zero. Para voltar ao estado de teste, rode o seed.sql,
-- que já começa com este mesmo reset — mantenha os dois iguais.
-- ============================================================================
BEGIN;

DO $$
DECLARE
  v_tabelas text;
BEGIN
  -- Checagens separadas: a de _ambiente só é analisada se a tabela existir.
  IF to_regclass('public._em_uso') IS NOT NULL THEN
    RAISE EXCEPTION 'Este banco está EM USO, com dados reais. reset.sql não roda mais aqui.';
  END IF;
  IF to_regclass('public._ambiente') IS NULL THEN
    RAISE EXCEPTION 'Banco sem a marca de desenvolvimento (rode 00-marcador.sql). Nada foi apagado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public._ambiente WHERE nome = 'desenvolvimento') THEN
    RAISE EXCEPTION 'Banco sem a marca de desenvolvimento (rode 00-marcador.sql). Nada foi apagado.';
  END IF;

  -- Todas as tabelas do app que existirem neste banco. A lista já inclui as
  -- tabelas que só passam a existir com o fechamento de contas.
  SELECT string_agg(format('public.%I', t), ', ')
    INTO v_tabelas
    FROM unnest(ARRAY[
      'periodo_divergencias', 'fechamento_itens', 'periodos_fechamento',
      'configuracao_historico', 'fechamentos', 'pagamentos', 'compras', 'fiadores'
    ]) AS t
   WHERE to_regclass(format('public.%I', t)) IS NOT NULL;

  -- TRUNCATE não dispara triggers de DELETE, então nada bloqueia o reset.
  EXECUTE 'TRUNCATE ' || v_tabelas || ' RESTART IDENTITY CASCADE';

  IF to_regclass('public.configuracao') IS NOT NULL THEN
    EXECUTE 'UPDATE public.configuracao SET dia_fechamento = 6, atualizado_em = now()';
  END IF;
END $$;

COMMIT;

SELECT count(*) AS fichas_restantes FROM public.fiadores;  -- deve ser 0
