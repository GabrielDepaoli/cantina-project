-- ============================================================================
-- CORREÇÃO: definir_dia_fechamento falhava pela API com
--   "UPDATE requires a WHERE clause" (código 21000).
-- O Supabase carrega a extensão safeupdate nas sessões da API: todo UPDATE ou
-- DELETE sem WHERE é recusado, inclusive dentro de funções SECURITY DEFINER.
-- A tabela configuracao tem uma linha só (id = true); o UPDATE agora diz isso.
-- Nada mais muda na função. Os privilégios (GRANT/REVOKE) são mantidos pelo
-- CREATE OR REPLACE.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.definir_dia_fechamento(p_dia SMALLINT, p_confirmar_aviso BOOLEAN DEFAULT false)
RETURNS public.configuracao
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sim    JSONB;
  v_conf   public.configuracao;
  v_lista  TEXT;
  v_linhas INTEGER;
  v_msg    TEXT;
BEGIN
  PERFORM 1 FROM public.configuracao WHERE id FOR UPDATE;
  v_sim := public.simular_troca_dia(p_dia);

  IF (v_sim->>'mesmo_dia')::boolean THEN
    RAISE EXCEPTION 'O dia de fechamento já é %.', p_dia USING ERRCODE = 'CF012';
  END IF;

  IF jsonb_array_length(v_sim->'pendentes') > 0 THEN
    SELECT string_agg(to_char((e->>'data_inicio')::date, 'DD/MM') || '–' || to_char((e->>'data_fim')::date, 'DD/MM'), ', ')
      INTO v_lista
      FROM jsonb_array_elements(v_sim->'pendentes') e;
    RAISE EXCEPTION 'Há % período(s) pendente(s): %. Feche-os antes de trocar o dia.',
      jsonb_array_length(v_sim->'pendentes'), v_lista USING ERRCODE = 'CF008';
  END IF;

  IF jsonb_typeof(v_sim->'transicao_aberta') = 'object' THEN
    v_msg := format(
      'A troca anterior (dia %s → %s) gerou a transição %s–%s, que ainda não foi fechada. Feche-a quando terminar (a partir de %s) e então troque o dia.',
      v_sim->'transicao_aberta'->>'dia_anterior',
      v_sim->'transicao_aberta'->>'dia_novo',
      to_char((v_sim->'transicao_aberta'->>'data_inicio')::date, 'DD/MM'),
      to_char((v_sim->'transicao_aberta'->>'data_fim')::date, 'DD/MM'),
      to_char((v_sim->'transicao_aberta'->>'data_fim')::date + 1, 'DD/MM'));
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'CF009';
  END IF;

  IF (v_sim->>'aviso_curta')::boolean AND NOT coalesce(p_confirmar_aviso, false) THEN
    RAISE EXCEPTION 'A transição terá só % dia(s). Confirme o aviso para continuar.', v_sim->>'dias'
      USING ERRCODE = 'CF010';
  END IF;

  UPDATE public.configuracao SET dia_fechamento = p_dia, atualizado_em = now() WHERE id RETURNING * INTO v_conf;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'Configuração não encontrada.';
  END IF;

  INSERT INTO public.configuracao_historico (dia_anterior, dia_novo, transicao_inicio, transicao_fim, aviso_confirmado)
  VALUES ((v_sim->>'dia_atual')::smallint, p_dia, (v_sim->>'transicao_inicio')::date, (v_sim->>'transicao_fim')::date,
          (v_sim->>'aviso_curta')::boolean AND coalesce(p_confirmar_aviso, false));

  RETURN v_conf;
END;
$$;

COMMIT;
