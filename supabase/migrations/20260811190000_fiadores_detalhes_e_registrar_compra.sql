
-- Add detailed guardian/holder fields to fiadores (captured by the "Nova Ficha" form
-- but not persisted until now: account type, second guardian, celular/cpf)
ALTER TABLE public.fiadores
  ADD COLUMN tipo TEXT NOT NULL DEFAULT 'dependente' CHECK (tipo IN ('dependente', 'independente')),
  ADD COLUMN resp1_celular TEXT,
  ADD COLUMN resp1_cpf TEXT,
  ADD COLUMN resp2_nome TEXT,
  ADD COLUMN resp2_celular TEXT,
  ADD COLUMN resp2_cpf TEXT;

-- Atomically register a purchase: insert into compras and bump the fiador's saldo_atual
-- in one transaction, avoiding a read-then-write race between concurrent purchases.
CREATE OR REPLACE FUNCTION public.registrar_compra(
  p_fiador_id UUID,
  p_descricao TEXT,
  p_valor NUMERIC,
  p_mes_referencia TEXT
)
RETURNS public.compras
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_compra public.compras;
BEGIN
  INSERT INTO public.compras (fiador_id, descricao, valor, mes_referencia)
  VALUES (p_fiador_id, p_descricao, p_valor, p_mes_referencia)
  RETURNING * INTO v_compra;

  UPDATE public.fiadores
  SET saldo_atual = saldo_atual + p_valor
  WHERE id = p_fiador_id;

  RETURN v_compra;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_compra(UUID, TEXT, NUMERIC, TEXT) TO authenticated;
