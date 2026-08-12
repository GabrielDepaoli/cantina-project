
-- Payments: the missing half of "fiado" — until now saldo_atual could only go up.
-- Any payment (partial or full, at any time) is logged here and reduces the balance.
CREATE TABLE public.pagamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fiador_id UUID NOT NULL REFERENCES public.fiadores(id) ON DELETE CASCADE,
  valor NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  observacao TEXT,
  data TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pagamentos" ON public.pagamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert pagamentos" ON public.pagamentos FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_pagamentos_fiador ON public.pagamentos(fiador_id, data);

-- Atomically register a payment: insert into pagamentos and reduce the fiador's
-- saldo_atual, mirroring registrar_compra() in the opposite direction.
CREATE OR REPLACE FUNCTION public.registrar_pagamento(
  p_fiador_id UUID,
  p_valor NUMERIC,
  p_observacao TEXT DEFAULT NULL
)
RETURNS public.pagamentos
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_pagamento public.pagamentos;
BEGIN
  INSERT INTO public.pagamentos (fiador_id, valor, observacao)
  VALUES (p_fiador_id, p_valor, p_observacao)
  RETURNING * INTO v_pagamento;

  UPDATE public.fiadores
  SET saldo_atual = saldo_atual - p_valor
  WHERE id = p_fiador_id;

  RETURN v_pagamento;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_pagamento(UUID, NUMERIC, TEXT) TO authenticated;

-- valor_pago records how much actually came in for that month at closing time,
-- separate from "total" (what was owed) — a closing can be partial.
ALTER TABLE public.fechamentos
  ADD COLUMN valor_pago NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Bulk month-end closing: for every active fiador, snapshot how much was owed
-- this month (open compras) vs. how much was paid this month (pagamentos), record
-- it in fechamentos, and archive those compras as fechado = true. This is purely
-- archival/reporting — it never touches saldo_atual, so any unpaid remainder keeps
-- rolling forward on the fiador's balance exactly as it already does today.
CREATE OR REPLACE FUNCTION public.fechar_mes(p_mes_referencia TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_inicio TIMESTAMP WITH TIME ZONE := (p_mes_referencia || '-01')::timestamptz;
  v_fim TIMESTAMP WITH TIME ZONE := v_inicio + INTERVAL '1 month';
  v_fiador RECORD;
  v_total NUMERIC;
  v_pago NUMERIC;
  v_count INTEGER := 0;
BEGIN
  FOR v_fiador IN SELECT id FROM public.fiadores WHERE status = 'ativo' LOOP
    SELECT COALESCE(SUM(valor), 0) INTO v_total
    FROM public.compras
    WHERE fiador_id = v_fiador.id AND mes_referencia = p_mes_referencia AND fechado = false;

    IF v_total = 0 THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(valor), 0) INTO v_pago
    FROM public.pagamentos
    WHERE fiador_id = v_fiador.id AND data >= v_inicio AND data < v_fim;

    INSERT INTO public.fechamentos (fiador_id, mes_referencia, total, valor_pago)
    VALUES (v_fiador.id, p_mes_referencia, v_total, v_pago)
    ON CONFLICT (fiador_id, mes_referencia) DO NOTHING;

    UPDATE public.compras
    SET fechado = true
    WHERE fiador_id = v_fiador.id AND mes_referencia = p_mes_referencia AND fechado = false;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fechar_mes(TEXT) TO authenticated;
