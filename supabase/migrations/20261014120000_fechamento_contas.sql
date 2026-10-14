-- ============================================================================
-- FECHAMENTO DE CONTAS POR PERÍODO (docs/plano-fechamento.md, v6, etapa 1)
--
-- - Sai o fechamento antigo: função fechar_mes e tabela fechamentos (só tinham
--   dados de teste). Nenhuma coluna é apagada.
-- - Entram: configuracao (dia-âncora), configuracao_historico,
--   periodos_fechamento, fechamento_itens, periodo_divergencias, a view
--   v_atraso_fichas e as funções do fechamento.
-- - registrar_compra e registrar_pagamento passam a SECURITY DEFINER; o
--   pagamento que zera o saldo quita os itens em aberto da ficha.
-- - Permissões endurecidas: compras e pagamentos só são escritos pelas RPCs;
--   fiadores aceita INSERT/UPDATE direto só nas colunas que o app usa.
--
-- Códigos de erro próprios (campo "code" na resposta da API):
--   CF001 ficha com fechamento em aberto não pode ser excluída
--   CF002 divergência razão × saldo diferente da confirmada (lista em "details")
--   CF003 período já fechado
--   CF004 vendas ou pagamentos em andamento (lock não obtido em 3 s)
--   CF005 não há período encerrado para fechar
--   CF006 o período pedido não é o próximo a fechar
--   CF007 ficha não encontrada
--   CF008 troca de dia bloqueada: há períodos pendentes
--   CF009 troca de dia bloqueada: transição anterior ainda não fechada
--   CF010 transição curta (< 7 dias) sem confirmação do aviso
--   CF011 dia fora de 1–31
--   CF012 o dia escolhido já é o atual
--   CF013 quitação incompleta (não deveria acontecer)
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------- 1. fechamento antigo sai
DROP FUNCTION IF EXISTS public.fechar_mes(TEXT);
DROP TABLE IF EXISTS public.fechamentos;

-- ---------------------------------------------------------------- 2. tabelas
CREATE TABLE public.configuracao (
  id             BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),                          -- uma linha só
  dia_fechamento SMALLINT NOT NULL DEFAULT 6 CHECK (dia_fechamento BETWEEN 1 AND 31),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.configuracao DEFAULT VALUES;

CREATE TABLE public.configuracao_historico (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alterado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  alterado_por     UUID DEFAULT auth.uid(),
  dia_anterior     SMALLINT NOT NULL,
  dia_novo         SMALLINT NOT NULL,
  transicao_inicio DATE,                               -- transição mostrada e confirmada
  transicao_fim    DATE,
  aviso_confirmado BOOLEAN NOT NULL DEFAULT false      -- confirmou o aviso de transição < 7 dias
);

CREATE TABLE public.periodos_fechamento (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_anterior_id UUID UNIQUE REFERENCES public.periodos_fechamento(id) ON DELETE RESTRICT, -- cadeia linear
  data_inicio         DATE NOT NULL,
  data_fim            DATE NOT NULL,                     -- inclusiva
  dia_ancora          SMALLINT NOT NULL,                 -- âncora vigente no fechamento
  transicao           BOOLEAN NOT NULL DEFAULT false,
  fechado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  fechado_por         UUID DEFAULT auth.uid(),
  CONSTRAINT periodo_datas_validas CHECK (data_fim >= data_inicio),
  CONSTRAINT periodo_inicio_unico  UNIQUE (data_inicio),                        -- clique duplo
  CONSTRAINT periodo_sem_sobreposicao
    EXCLUDE USING gist (daterange(data_inicio, data_fim, '[]') WITH &&)
);
CREATE UNIQUE INDEX periodo_raiz_unica ON public.periodos_fechamento ((true))
  WHERE periodo_anterior_id IS NULL;

CREATE TABLE public.fechamento_itens (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id               UUID NOT NULL REFERENCES public.periodos_fechamento(id) ON DELETE RESTRICT,
  fiador_id                UUID REFERENCES public.fiadores(id) ON DELETE SET NULL,
  numero_ficha             TEXT NOT NULL,                -- congelado
  nome_aluno               TEXT NOT NULL,                -- congelado
  saldo_congelado          NUMERIC(10,2) NOT NULL CHECK (saldo_congelado > 0),
  quitado_em               TIMESTAMPTZ,
  quitado_por_pagamento_id UUID REFERENCES public.pagamentos(id) ON DELETE SET NULL,
  CONSTRAINT item_unico_por_periodo UNIQUE (periodo_id, fiador_id)
);
CREATE INDEX idx_itens_abertos_por_fiador ON public.fechamento_itens (fiador_id) WHERE quitado_em IS NULL;
CREATE INDEX idx_itens_por_periodo        ON public.fechamento_itens (periodo_id);
CREATE INDEX idx_compras_fiador_data      ON public.compras (fiador_id, data);

CREATE TABLE public.periodo_divergencias (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id   UUID NOT NULL REFERENCES public.periodos_fechamento(id) ON DELETE RESTRICT,
  fiador_id    UUID REFERENCES public.fiadores(id) ON DELETE SET NULL,
  numero_ficha TEXT NOT NULL,                            -- congelado
  nome_aluno   TEXT NOT NULL,                            -- congelado
  saldo_atual  NUMERIC(10,2) NOT NULL,                   -- fiadores.saldo_atual no instante
  saldo_razao  NUMERIC(10,2) NOT NULL,                   -- Σ compras − Σ pagamentos no instante
  CONSTRAINT divergencia_real   CHECK (saldo_atual <> saldo_razao),
  CONSTRAINT divergencia_unica  UNIQUE (periodo_id, fiador_id)
);

-- ---------------------------------------------------------------- 3. triggers
-- Invariante de encadeamento: cada período começa no dia seguinte ao fim do
-- último e aponta para ele. Junto com os UNIQUE e o EXCLUDE, não há buraco
-- nem sobreposição, nem bifurcação.
CREATE FUNCTION public.periodo_encadeado()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ultimo public.periodos_fechamento;
BEGIN
  SELECT * INTO v_ultimo FROM public.periodos_fechamento ORDER BY data_inicio DESC LIMIT 1;
  IF NOT FOUND THEN
    IF NEW.periodo_anterior_id IS NOT NULL THEN
      RAISE EXCEPTION 'O primeiro período não pode ter período anterior.';
    END IF;
  ELSE
    IF NEW.periodo_anterior_id IS DISTINCT FROM v_ultimo.id THEN
      RAISE EXCEPTION 'O período anterior precisa ser o último fechado (início %).', v_ultimo.data_inicio;
    END IF;
    IF NEW.data_inicio <> v_ultimo.data_fim + 1 THEN
      RAISE EXCEPTION 'O período precisa começar em % (dia seguinte ao fim do anterior).', v_ultimo.data_fim + 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER periodo_encadeado
  BEFORE INSERT ON public.periodos_fechamento
  FOR EACH ROW EXECUTE FUNCTION public.periodo_encadeado();

-- Ficha com fechamento em aberto não pode ser excluída (o histórico quitado
-- fica, com número e nome congelados no item).
CREATE FUNCTION public.impedir_exclusao_com_item_aberto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fechamento_itens WHERE fiador_id = OLD.id AND quitado_em IS NULL) THEN
    RAISE EXCEPTION 'A ficha % tem fechamento em aberto; quite antes de excluir.', OLD.numero_ficha
      USING ERRCODE = 'CF001';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER impedir_exclusao_com_item_aberto
  BEFORE DELETE ON public.fiadores
  FOR EACH ROW EXECUTE FUNCTION public.impedir_exclusao_com_item_aberto();

-- ---------------------------------------------------------------- 4. funções de cálculo
-- "Hoje" no fuso da cantina. Toda regra de data passa por aqui.
CREATE FUNCTION public.hoje_sp()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date
$$;

-- Âncora de um mês: o dia configurado, ou o último dia do mês se ele não existir.
-- p_indice = ano * 12 + (mês − 1), para somar e subtrair meses sem datas.
CREATE FUNCTION public.ancora_mes(p_indice INTEGER, p_dia SMALLINT)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT make_date(
    p_indice / 12,
    p_indice % 12 + 1,
    least(p_dia::int, extract(day FROM (make_date(p_indice / 12, p_indice % 12 + 1, 1) + interval '1 month - 1 day'))::int)
  )
$$;

-- Período regular (pela âncora p_dia) que contém p_data.
CREATE FUNCTION public.periodo_de(p_data DATE, p_dia SMALLINT, OUT data_inicio DATE, OUT data_fim DATE)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_indice INTEGER := extract(year FROM p_data)::int * 12 + extract(month FROM p_data)::int - 1;
BEGIN
  IF p_data >= public.ancora_mes(v_indice, p_dia) THEN
    data_inicio := public.ancora_mes(v_indice, p_dia);
    data_fim    := public.ancora_mes(v_indice + 1, p_dia) - 1;
  ELSE
    data_inicio := public.ancora_mes(v_indice - 1, p_dia);
    data_fim    := public.ancora_mes(v_indice, p_dia) - 1;
  END IF;
END;
$$;

-- Corte de um período: o dia seguinte ao fim, 00:00 em São Paulo.
CREATE FUNCTION public.corte_do_periodo(p_data_fim DATE)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (p_data_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
$$;

-- Saldo da ficha pelo razão (Σ compras − Σ pagamentos) antes do corte.
CREATE FUNCTION public.saldo_no_corte(p_fiador_id UUID, p_corte TIMESTAMPTZ)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((SELECT sum(c.valor) FROM public.compras c    WHERE c.fiador_id = p_fiador_id AND c.data < p_corte), 0)
       - coalesce((SELECT sum(p.valor) FROM public.pagamentos p WHERE p.fiador_id = p_fiador_id AND p.data < p_corte), 0)
$$;

-- Cadeia de períodos a partir do último fechado (ou do período da primeira
-- compra). Devolve todos os pendentes (já terminados) e, por último, o período
-- em andamento (pendente = false). Vazio se ainda não há compra nenhuma.
-- Um período que não começa na âncora atual é de transição (troca de dia).
CREATE FUNCTION public.proximos_periodos()
RETURNS TABLE (ordem INTEGER, data_inicio DATE, data_fim DATE, transicao BOOLEAN, pendente BOOLEAN)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_dia      SMALLINT;
  v_hoje     DATE := public.hoje_sp();
  v_inicio   DATE;
  v_primeira TIMESTAMPTZ;
  v_regular  RECORD;
  v_n        INTEGER := 0;
BEGIN
  SELECT c.dia_fechamento INTO v_dia FROM public.configuracao c;
  SELECT p.data_fim + 1 INTO v_inicio FROM public.periodos_fechamento p ORDER BY p.data_inicio DESC LIMIT 1;
  IF v_inicio IS NULL THEN
    SELECT min(c.data) INTO v_primeira FROM public.compras c;
    IF v_primeira IS NULL THEN
      RETURN;
    END IF;
    SELECT r.data_inicio INTO v_inicio
      FROM public.periodo_de((v_primeira AT TIME ZONE 'America/Sao_Paulo')::date, v_dia) r;
  END IF;

  LOOP
    SELECT * INTO v_regular FROM public.periodo_de(v_inicio, v_dia);
    v_n         := v_n + 1;
    ordem       := v_n;
    data_inicio := v_inicio;
    data_fim    := v_regular.data_fim;
    transicao   := v_regular.data_inicio <> v_inicio;
    pendente    := v_regular.data_fim < v_hoje;
    RETURN NEXT;
    EXIT WHEN NOT pendente;
    v_inicio := v_regular.data_fim + 1;
  END LOOP;
END;
$$;

-- Fichas em que o saldo do banco difere do razão completo. Só leitura.
CREATE FUNCTION public.verificar_divergencias()
RETURNS TABLE (fiador_id UUID, numero_ficha TEXT, nome_aluno TEXT, saldo_atual NUMERIC, saldo_razao NUMERIC)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT f.id, f.numero_ficha, f.nome_aluno, f.saldo_atual, r.razao
  FROM public.fiadores f
  CROSS JOIN LATERAL (
    SELECT coalesce((SELECT sum(c.valor) FROM public.compras c    WHERE c.fiador_id = f.id), 0)
         - coalesce((SELECT sum(p.valor) FROM public.pagamentos p WHERE p.fiador_id = f.id), 0) AS razao
  ) r
  WHERE f.saldo_atual <> r.razao
  ORDER BY f.numero_ficha
$$;

-- O que o próximo fechamento vai congelar: período, número de fichas e total.
-- Vazio quando não há período pendente.
CREATE FUNCTION public.previa_fechamento()
RETURNS TABLE (data_inicio DATE, data_fim DATE, transicao BOOLEAN, fichas INTEGER, total NUMERIC)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_prox  RECORD;
  v_corte TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_prox FROM public.proximos_periodos() pp WHERE pp.pendente ORDER BY pp.ordem LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  v_corte := public.corte_do_periodo(v_prox.data_fim);
  RETURN QUERY
    SELECT v_prox.data_inicio, v_prox.data_fim, v_prox.transicao, count(*)::int, coalesce(sum(s.saldo), 0)
    FROM (SELECT public.saldo_no_corte(f.id, v_corte) AS saldo FROM public.fiadores f) s
    WHERE s.saldo > 0;
END;
$$;

-- Transição gerada pela última troca de dia que ainda não foi fechada.
CREATE FUNCTION public.transicao_aberta()
RETURNS TABLE (dia_anterior SMALLINT, dia_novo SMALLINT, transicao_inicio DATE, transicao_fim DATE)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT h.dia_anterior, h.dia_novo, h.transicao_inicio, h.transicao_fim
  FROM (SELECT * FROM public.configuracao_historico ORDER BY id DESC LIMIT 1) h
  WHERE h.transicao_inicio IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.periodos_fechamento p WHERE p.data_inicio = h.transicao_inicio)
$$;

-- O que acontece se o dia-âncora mudar para p_dia. Só leitura.
CREATE FUNCTION public.simular_troca_dia(p_dia SMALLINT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_atual      SMALLINT;
  v_pendentes  JSONB;
  v_trans      RECORD;
  v_tem_trans  BOOLEAN;
  v_ultimo_fim DATE;
  v_regular    RECORD;
  v_ini        DATE;
  v_fim        DATE;
BEGIN
  IF p_dia IS NULL OR p_dia NOT BETWEEN 1 AND 31 THEN
    RAISE EXCEPTION 'O dia de fechamento precisa estar entre 1 e 31.' USING ERRCODE = 'CF011';
  END IF;

  SELECT c.dia_fechamento INTO v_atual FROM public.configuracao c;

  SELECT coalesce(jsonb_agg(jsonb_build_object('data_inicio', pp.data_inicio, 'data_fim', pp.data_fim,
                                               'transicao', pp.transicao) ORDER BY pp.ordem), '[]'::jsonb)
    INTO v_pendentes
    FROM public.proximos_periodos() pp
   WHERE pp.pendente;

  SELECT * INTO v_trans FROM public.transicao_aberta();
  v_tem_trans := FOUND;

  SELECT max(p.data_fim) INTO v_ultimo_fim FROM public.periodos_fechamento p;
  IF v_ultimo_fim IS NOT NULL AND p_dia <> v_atual THEN
    SELECT * INTO v_regular FROM public.periodo_de(v_ultimo_fim + 1, p_dia);
    IF v_regular.data_inicio <> v_ultimo_fim + 1 THEN
      v_ini := v_ultimo_fim + 1;
      v_fim := v_regular.data_fim;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'dia_atual',        v_atual,
    'dia_novo',         p_dia,
    'mesmo_dia',        p_dia = v_atual,
    'pendentes',        v_pendentes,
    'transicao_aberta', CASE WHEN v_tem_trans THEN jsonb_build_object(
                          'dia_anterior', v_trans.dia_anterior, 'dia_novo', v_trans.dia_novo,
                          'data_inicio', v_trans.transicao_inicio, 'data_fim', v_trans.transicao_fim) END,
    'bloqueado',        jsonb_array_length(v_pendentes) > 0 OR v_tem_trans,
    'transicao_inicio', v_ini,
    'transicao_fim',    v_fim,
    'dias',             CASE WHEN v_ini IS NOT NULL THEN v_fim - v_ini + 1 END,
    'sem_transicao',    v_ini IS NULL,
    'aviso_curta',      v_ini IS NOT NULL AND v_fim - v_ini + 1 < 7
  );
END;
$$;

-- ---------------------------------------------------------------- 5. funções de escrita (SECURITY DEFINER)
-- Fecha o período pendente mais antigo, que precisa ser p_data_inicio.
-- p_divergencias_confirmadas: a lista que o operador viu e confirmou,
-- [{fiador_id, saldo_atual, saldo_razao}, ...]; vazia quando não há divergência.
CREATE FUNCTION public.fechar_periodo(p_data_inicio DATE, p_divergencias_confirmadas JSONB DEFAULT '[]'::jsonb)
RETURNS public.periodos_fechamento
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dia        SMALLINT;
  v_prox       RECORD;
  v_tem_prox   BOOLEAN;
  v_corte      TIMESTAMPTZ;
  v_anterior   UUID;
  v_periodo    public.periodos_fechamento;
  v_atual      JSONB;
  v_confirmada JSONB;
BEGIN
  -- Trava a configuração e todas as fichas (ordem fixa: sem deadlock). Venda e
  -- pagamento travam a ficha antes de gravar, então nada entra no razão agora.
  -- Se alguma venda segurar a ficha por mais de 3 s, desiste em vez de esperar.
  PERFORM set_config('lock_timeout', '3s', true);
  BEGIN
    SELECT c.dia_fechamento INTO v_dia FROM public.configuracao c FOR UPDATE;
    PERFORM 1 FROM public.fiadores f ORDER BY f.id FOR UPDATE;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'Há vendas ou pagamentos em andamento; tente de novo em instantes.' USING ERRCODE = 'CF004';
  END;

  SELECT * INTO v_prox FROM public.proximos_periodos() pp WHERE pp.pendente ORDER BY pp.ordem LIMIT 1;
  v_tem_prox := FOUND;
  IF NOT v_tem_prox OR v_prox.data_inicio <> p_data_inicio THEN
    IF EXISTS (SELECT 1 FROM public.periodos_fechamento p WHERE p.data_inicio = p_data_inicio) THEN
      RAISE EXCEPTION 'Período já fechado.' USING ERRCODE = 'CF003';
    ELSIF NOT v_tem_prox THEN
      RAISE EXCEPTION 'Não há período encerrado para fechar.' USING ERRCODE = 'CF005';
    ELSE
      RAISE EXCEPTION 'O próximo período a fechar começa em %.', to_char(v_prox.data_inicio, 'DD/MM/YYYY')
        USING ERRCODE = 'CF006';
    END IF;
  END IF;

  -- Divergência recalculada com as fichas já travadas, comparada com o que o
  -- operador confirmou (mesmas fichas, mesmos valores).
  SELECT coalesce(jsonb_agg(jsonb_build_object('fiador_id', d.fiador_id, 'saldo_atual', d.saldo_atual,
                                               'saldo_razao', d.saldo_razao) ORDER BY d.fiador_id), '[]'::jsonb)
    INTO v_atual
    FROM public.verificar_divergencias() d;
  SELECT coalesce(jsonb_agg(jsonb_build_object('fiador_id', (e->>'fiador_id')::uuid,
                                               'saldo_atual', (e->>'saldo_atual')::numeric,
                                               'saldo_razao', (e->>'saldo_razao')::numeric)
                            ORDER BY (e->>'fiador_id')::uuid), '[]'::jsonb)
    INTO v_confirmada
    FROM jsonb_array_elements(coalesce(p_divergencias_confirmadas, '[]'::jsonb)) e;
  IF v_atual <> v_confirmada THEN
    RAISE EXCEPTION 'A divergência entre razão e saldo mudou; confira a lista e confirme de novo.'
      USING ERRCODE = 'CF002', DETAIL = v_atual::text;
  END IF;

  v_corte := public.corte_do_periodo(v_prox.data_fim);
  SELECT p.id INTO v_anterior FROM public.periodos_fechamento p ORDER BY p.data_inicio DESC LIMIT 1;

  BEGIN
    INSERT INTO public.periodos_fechamento (periodo_anterior_id, data_inicio, data_fim, dia_ancora, transicao)
    VALUES (v_anterior, v_prox.data_inicio, v_prox.data_fim, v_dia, v_prox.transicao)
    RETURNING * INTO v_periodo;
  EXCEPTION WHEN unique_violation OR exclusion_violation THEN
    RAISE EXCEPTION 'Período já fechado.' USING ERRCODE = 'CF003';
  END;

  INSERT INTO public.periodo_divergencias (periodo_id, fiador_id, numero_ficha, nome_aluno, saldo_atual, saldo_razao)
  SELECT v_periodo.id, d.fiador_id, d.numero_ficha, d.nome_aluno, d.saldo_atual, d.saldo_razao
  FROM public.verificar_divergencias() d;

  -- Itens: ficha com saldo > 0 no corte. Já nasce quitado se, depois do corte,
  -- o saldo pelo razão chegou a ≤ 0 (o primeiro evento que faz isso é sempre
  -- um pagamento). No mesmo instante, compra conta antes de pagamento.
  WITH devedores AS (
    SELECT f.id AS fiador_id, f.numero_ficha, f.nome_aluno, s.saldo
    FROM public.fiadores f
    CROSS JOIN LATERAL (SELECT public.saldo_no_corte(f.id, v_corte) AS saldo) s
    WHERE s.saldo > 0
  ),
  eventos AS (
    SELECT c.fiador_id, c.data, 0 AS tipo, c.id, c.valor AS delta, NULL::uuid AS pagamento_id
    FROM public.compras c JOIN devedores d ON d.fiador_id = c.fiador_id
    WHERE c.data >= v_corte
    UNION ALL
    SELECT p.fiador_id, p.data, 1, p.id, -p.valor, p.id
    FROM public.pagamentos p JOIN devedores d ON d.fiador_id = p.fiador_id
    WHERE p.data >= v_corte
  ),
  acumulado AS (
    SELECT e.*, d.saldo + sum(e.delta) OVER (PARTITION BY e.fiador_id ORDER BY e.data, e.tipo, e.id) AS saldo_apos
    FROM eventos e JOIN devedores d ON d.fiador_id = e.fiador_id
  ),
  quitacao AS (
    SELECT DISTINCT ON (a.fiador_id) a.fiador_id, a.data AS quitado_em, a.pagamento_id
    FROM acumulado a
    WHERE a.saldo_apos <= 0
    ORDER BY a.fiador_id, a.data, a.tipo, a.id
  )
  INSERT INTO public.fechamento_itens
    (periodo_id, fiador_id, numero_ficha, nome_aluno, saldo_congelado, quitado_em, quitado_por_pagamento_id)
  SELECT v_periodo.id, d.fiador_id, d.numero_ficha, d.nome_aluno, d.saldo, q.quitado_em, q.pagamento_id
  FROM devedores d
  LEFT JOIN quitacao q ON q.fiador_id = d.fiador_id;

  RETURN v_periodo;
END;
$$;

-- Assinatura e retorno iguais aos de antes. Agora trava a ficha (UPDATE)
-- antes de gravar no razão e exige que a ficha exista.
CREATE OR REPLACE FUNCTION public.registrar_compra(
  p_fiador_id UUID,
  p_descricao TEXT,
  p_valor NUMERIC,
  p_mes_referencia TEXT
)
RETURNS public.compras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_compra public.compras;
  v_linhas INTEGER;
BEGIN
  UPDATE public.fiadores SET saldo_atual = saldo_atual + p_valor WHERE id = p_fiador_id;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'Ficha não encontrada.' USING ERRCODE = 'CF007';
  END IF;

  INSERT INTO public.compras (fiador_id, descricao, valor, mes_referencia)
  VALUES (p_fiador_id, p_descricao, p_valor, p_mes_referencia)
  RETURNING * INTO v_compra;

  RETURN v_compra;
END;
$$;

-- Pagamento que deixa o saldo ≤ 0 quita todos os itens em aberto da ficha.
-- Pagamento parcial não toca nos itens (não existe quitação parcial).
CREATE OR REPLACE FUNCTION public.registrar_pagamento(
  p_fiador_id UUID,
  p_valor NUMERIC,
  p_observacao TEXT DEFAULT NULL
)
RETURNS public.pagamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pagamento public.pagamentos;
  v_saldo     NUMERIC;
  v_linhas    INTEGER;
BEGIN
  UPDATE public.fiadores SET saldo_atual = saldo_atual - p_valor
   WHERE id = p_fiador_id
  RETURNING saldo_atual INTO v_saldo;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_linhas <> 1 THEN
    RAISE EXCEPTION 'Ficha não encontrada.' USING ERRCODE = 'CF007';
  END IF;

  INSERT INTO public.pagamentos (fiador_id, valor, observacao)
  VALUES (p_fiador_id, p_valor, p_observacao)
  RETURNING * INTO v_pagamento;

  IF v_saldo <= 0 THEN
    UPDATE public.fechamento_itens
       SET quitado_em = now(), quitado_por_pagamento_id = v_pagamento.id
     WHERE fiador_id = p_fiador_id AND quitado_em IS NULL;
    -- Pós-condição só neste ramo: com o saldo ≤ 0, não pode restar item aberto.
    IF EXISTS (SELECT 1 FROM public.fechamento_itens WHERE fiador_id = p_fiador_id AND quitado_em IS NULL) THEN
      RAISE EXCEPTION 'Quitação incompleta da ficha %.', p_fiador_id USING ERRCODE = 'CF013';
    END IF;
  END IF;

  RETURN v_pagamento;
END;
$$;

-- Troca o dia-âncora. Bloqueada com período pendente ou com a transição da
-- troca anterior ainda aberta. A transição não é gravada aqui: ela vira
-- período quando for fechada (fechar_periodo a marca como transição).
CREATE FUNCTION public.definir_dia_fechamento(p_dia SMALLINT, p_confirmar_aviso BOOLEAN DEFAULT false)
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
  PERFORM 1 FROM public.configuracao FOR UPDATE;
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

  UPDATE public.configuracao SET dia_fechamento = p_dia, atualizado_em = now() RETURNING * INTO v_conf;
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

-- ---------------------------------------------------------------- 6. view de atraso
-- Atraso = períodos fechados desde o item aberto mais antigo da ficha,
-- contando o período desse item.
CREATE VIEW public.v_atraso_fichas WITH (security_invoker = true) AS
WITH mais_antigo AS (
  SELECT i.fiador_id, min(p.data_inicio) AS desde
  FROM public.fechamento_itens i
  JOIN public.periodos_fechamento p ON p.id = i.periodo_id
  WHERE i.quitado_em IS NULL AND i.fiador_id IS NOT NULL
  GROUP BY i.fiador_id
)
SELECT m.fiador_id,
       m.desde,
       (SELECT count(*)::int FROM public.periodos_fechamento p WHERE p.data_inicio >= m.desde) AS atraso
FROM mais_antigo m;

-- ---------------------------------------------------------------- 7. permissões
-- Tabelas novas: só leitura pela API. Escrita só pelas funções acima.
ALTER TABLE public.configuracao           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracao_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periodos_fechamento    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechamento_itens       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periodo_divergencias   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read configuracao"           ON public.configuracao           FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read configuracao_historico" ON public.configuracao_historico FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read periodos_fechamento"    ON public.periodos_fechamento    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read fechamento_itens"       ON public.fechamento_itens       FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read periodo_divergencias"   ON public.periodo_divergencias   FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.configuracao, public.configuracao_historico, public.periodos_fechamento,
              public.fechamento_itens, public.periodo_divergencias, public.v_atraso_fichas
  FROM anon, authenticated;
GRANT SELECT ON public.configuracao, public.configuracao_historico, public.periodos_fechamento,
                public.fechamento_itens, public.periodo_divergencias, public.v_atraso_fichas
  TO authenticated;

-- compras e pagamentos: só as RPCs escrevem (elas mantêm razão e saldo juntos).
DROP POLICY IF EXISTS "Authenticated users can insert compras"    ON public.compras;
DROP POLICY IF EXISTS "Authenticated users can update compras"    ON public.compras;
DROP POLICY IF EXISTS "Authenticated users can delete compras"    ON public.compras;
DROP POLICY IF EXISTS "Authenticated users can insert pagamentos" ON public.pagamentos;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.compras, public.pagamentos FROM anon, authenticated;

-- fiadores: INSERT e UPDATE direto só nas colunas que o app usa (nunca
-- saldo_atual). DELETE continua (com o trigger de item aberto).
REVOKE INSERT, UPDATE, TRUNCATE ON public.fiadores FROM anon, authenticated;
REVOKE DELETE ON public.fiadores FROM anon;
GRANT INSERT (numero_ficha, nome_aluno, nome_responsavel, tipo, resp1_celular, resp1_cpf,
              resp2_nome, resp2_celular, resp2_cpf, observacoes, bloqueada, somente_credito)
  ON public.fiadores TO authenticated;
GRANT UPDATE (nome_aluno, nome_responsavel, resp1_celular, resp1_cpf, resp2_nome, resp2_celular,
              resp2_cpf, observacoes, bloqueada, somente_credito)
  ON public.fiadores TO authenticated;

-- Funções: o Postgres dá EXECUTE a PUBLIC por padrão. Com SECURITY DEFINER,
-- isso deixaria o anon (chave pública) escrever. Só authenticated executa.
REVOKE EXECUTE ON FUNCTION
  public.registrar_compra(UUID, TEXT, NUMERIC, TEXT),
  public.registrar_pagamento(UUID, NUMERIC, TEXT),
  public.fechar_periodo(DATE, JSONB),
  public.definir_dia_fechamento(SMALLINT, BOOLEAN),
  public.simular_troca_dia(SMALLINT),
  public.proximos_periodos(),
  public.previa_fechamento(),
  public.verificar_divergencias(),
  public.transicao_aberta(),
  public.hoje_sp(),
  public.ancora_mes(INTEGER, SMALLINT),
  public.periodo_de(DATE, SMALLINT),
  public.corte_do_periodo(DATE),
  public.saldo_no_corte(UUID, TIMESTAMPTZ),
  public.periodo_encadeado(),
  public.impedir_exclusao_com_item_aberto()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.registrar_compra(UUID, TEXT, NUMERIC, TEXT),
  public.registrar_pagamento(UUID, NUMERIC, TEXT),
  public.fechar_periodo(DATE, JSONB),
  public.definir_dia_fechamento(SMALLINT, BOOLEAN),
  public.simular_troca_dia(SMALLINT),
  public.proximos_periodos(),
  public.previa_fechamento(),
  public.verificar_divergencias(),
  public.transicao_aberta(),
  public.hoje_sp(),
  public.ancora_mes(INTEGER, SMALLINT),
  public.periodo_de(DATE, SMALLINT),
  public.corte_do_periodo(DATE),
  public.saldo_no_corte(UUID, TIMESTAMPTZ)
  TO authenticated;

COMMIT;
