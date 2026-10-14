-- ============================================================================
-- ENTRADA EM USO — rodar UMA VEZ, no dia em que o sistema passa a ter dados
-- reais (etapa 4 do docs/plano-fechamento.md).
--
-- O que faz, numa transação só:
--   1. apaga TODOS os dados de teste (fichas, compras, pagamentos, fechamentos);
--   2. remove o marcador de desenvolvimento (public._ambiente);
--   3. cria public._em_uso, com a data.
-- Depois disso, 00-marcador.sql, seed.sql e reset.sql recusam rodar para
-- sempre neste banco, e este arquivo também (ele exige o marcador).
--
-- Não mexe no schema, nos usuários do Supabase Auth nem na configuração do dia.
--
-- PARA RODAR: troque 'NAO' por 'APAGAR OS DADOS DE TESTE' na linha marcada.
-- ============================================================================
BEGIN;

DO $$
DECLARE
  v_confirmacao text := 'NAO';   -- <<< troque por 'APAGAR OS DADOS DE TESTE'
  v_tabelas     text;
BEGIN
  IF v_confirmacao <> 'APAGAR OS DADOS DE TESTE' THEN
    RAISE EXCEPTION 'Confirmação não preenchida. Leia o cabeçalho deste arquivo. Nada foi apagado.';
  END IF;
  IF to_regclass('public._em_uso') IS NOT NULL THEN
    RAISE EXCEPTION 'Este banco já entrou em uso. Nada foi apagado.';
  END IF;
  IF to_regclass('public._ambiente') IS NULL THEN
    RAISE EXCEPTION 'Banco sem a marca de desenvolvimento. Nada foi apagado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public._ambiente WHERE nome = 'desenvolvimento') THEN
    RAISE EXCEPTION 'Banco sem a marca de desenvolvimento. Nada foi apagado.';
  END IF;

  -- mesma lista do reset.sql
  SELECT string_agg(format('public.%I', t), ', ')
    INTO v_tabelas
    FROM unnest(ARRAY[
      'periodo_divergencias', 'fechamento_itens', 'periodos_fechamento',
      'configuracao_historico', 'fechamentos', 'pagamentos', 'compras', 'fiadores'
    ]) AS t
   WHERE to_regclass(format('public.%I', t)) IS NOT NULL;

  EXECUTE 'TRUNCATE ' || v_tabelas || ' RESTART IDENTITY CASCADE';
END $$;

DROP TABLE public._ambiente;

CREATE TABLE public._em_uso (
  id    boolean PRIMARY KEY DEFAULT true CHECK (id),
  desde timestamptz NOT NULL DEFAULT now()
);
-- Invisível para a API do app, como era o _ambiente.
ALTER TABLE public._em_uso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._em_uso FROM anon, authenticated;
INSERT INTO public._em_uso DEFAULT VALUES;

COMMIT;

SELECT desde AS em_uso_desde, (SELECT count(*) FROM public.fiadores) AS fichas FROM public._em_uso;  -- fichas = 0
