-- ============================================================================
-- MARCADOR DE DESENVOLVIMENTO — rodar uma única vez, no SQL Editor, enquanto o
-- sistema ainda NÃO está em uso (o banco só tem dados de teste).
--
-- Cria a tabela public._ambiente com o valor 'desenvolvimento'. O seed.sql e o
-- reset.sql recusam rodar em qualquer banco que não tenha essa marca.
--
-- Guarda: recusa rodar se o sistema já entrou em uso (existe public._em_uso,
-- criada pelo entrada-em-uso.sql). Depois da entrada em uso, este arquivo,
-- o seed e o reset nunca mais rodam neste banco.
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public._em_uso') IS NOT NULL THEN
    RAISE EXCEPTION 'Este banco já está EM USO, com dados reais. O marcador de desenvolvimento não pode mais ser criado.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public._ambiente (
  nome       text PRIMARY KEY CHECK (nome = 'desenvolvimento'),
  marcado_em timestamptz NOT NULL DEFAULT now()
);

-- Invisível para a API do app: RLS ligada, nenhuma policy, nenhum privilégio
-- para os papéis anon e authenticated.
ALTER TABLE public._ambiente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._ambiente FROM anon, authenticated;

INSERT INTO public._ambiente (nome) VALUES ('desenvolvimento') ON CONFLICT DO NOTHING;

COMMIT;

SELECT nome, marcado_em FROM public._ambiente;
