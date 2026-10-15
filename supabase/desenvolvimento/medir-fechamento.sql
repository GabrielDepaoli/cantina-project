-- ============================================================================
-- MEDIÇÃO DO FECHAMENTO — quanto tempo fechar_periodo leva com o volume atual.
-- Fecha o período pendente mais antigo DENTRO de uma transação e desfaz tudo
-- no fim (ROLLBACK): nenhum período fica fechado.
-- Use depois do carga.sql. Referência do plano: se passar de 2000 ms, o aviso
-- do diálogo de fechar vira destaque.
-- ============================================================================
BEGIN;

CREATE TEMP TABLE medicao ON COMMIT DROP AS
SELECT clock_timestamp() AS inicio,
       (SELECT data_inicio FROM public.proximos_periodos() WHERE pendente ORDER BY ordem LIMIT 1) AS periodo;

SELECT public.fechar_periodo((SELECT periodo FROM medicao));

SELECT m.periodo,
       round(extract(epoch FROM clock_timestamp() - m.inicio) * 1000) AS ms,
       (SELECT count(*) FROM public.fiadores) AS fichas,
       (SELECT count(*) FROM public.fechamento_itens) AS itens_criados
FROM medicao m;

ROLLBACK;
