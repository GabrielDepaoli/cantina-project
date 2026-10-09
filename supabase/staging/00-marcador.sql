-- ============================================================================
-- MARCADOR DE STAGING — rodar SÓ no projeto de STAGING, uma única vez,
-- logo depois do setup-completo.sql. NUNCA rodar em produção.
--
-- Cria a tabela public._ambiente com o valor 'staging'. O seed.sql e o
-- reset.sql recusam rodar em qualquer banco que não tenha essa marca.
--
-- Guarda: recusa rodar se o banco já tiver qualquer ficha. Produção nunca
-- está vazia; um projeto de staging recém-criado sempre está.
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fiadores) THEN
    RAISE EXCEPTION 'Este banco já tem fichas. O marcador de staging só pode ser criado num projeto NOVO e VAZIO. Confira se você está no projeto de staging.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public._ambiente (
  nome       text PRIMARY KEY CHECK (nome = 'staging'),
  marcado_em timestamptz NOT NULL DEFAULT now()
);

-- Invisível para a API do app: RLS ligada, nenhuma policy, nenhum privilégio
-- para os papéis anon e authenticated.
ALTER TABLE public._ambiente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._ambiente FROM anon, authenticated;

INSERT INTO public._ambiente (nome) VALUES ('staging') ON CONFLICT DO NOTHING;

COMMIT;

SELECT nome, marcado_em FROM public._ambiente;
