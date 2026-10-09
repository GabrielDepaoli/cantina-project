-- ============================================================================
-- RESET DE STAGING — apaga TODOS os dados do app neste banco.
-- Só roda em banco marcado como staging (ver 00-marcador.sql); em qualquer
-- outro banco ele aborta sem tocar em nada.
--
-- Use para: limpar a cópia real restaurada de produção logo depois do teste
-- de restauração, ou voltar ao zero antes de rodar o seed.sql de novo.
-- A mesma lógica está no início do seed.sql — mantenha os dois iguais.
-- ============================================================================
BEGIN;

DO $$
DECLARE
  v_tabelas text;
BEGIN
  -- Duas checagens separadas: a segunda só é analisada se a tabela existir.
  IF to_regclass('public._ambiente') IS NULL THEN
    RAISE EXCEPTION 'Banco sem a marca de staging. reset.sql NUNCA roda em produção.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public._ambiente WHERE nome = 'staging') THEN
    RAISE EXCEPTION 'Banco sem a marca de staging. reset.sql NUNCA roda em produção.';
  END IF;

  -- Todas as tabelas do app que existirem neste banco. A lista já inclui as
  -- tabelas que só passam a existir a partir da etapa 2 do fechamento.
  SELECT string_agg(format('public.%I', t), ', ')
    INTO v_tabelas
    FROM unnest(ARRAY[
      'correcoes_saldo', 'periodo_divergencias', 'fechamento_itens', 'periodos_fechamento',
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
