# Estado atual — Fechamento de Contas

Atualizado em 14/10/2026. Plano completo: [`docs/plano-fechamento.md`](plano-fechamento.md) (v6).

## Premissa (v6)

- **O sistema ainda não está em uso.** As fichas do banco são de teste. Nenhum dado é real.
- **Ambiente único:** o projeto `yqhiazfknioaxlyzobrz` serve para desenvolver e testar. Na entrada em uso (etapa 4), ele é limpo e vira o banco real.

## Concluído

- **Etapa A — Ambiente único.** O modo staging saiu do código e os scripts foram para `supabase/desenvolvimento/`. Marcador e seed já rodados no banco (fichas 901–908). O projeto `cantina-staging` foi excluído.

## Etapa 1 — Banco: concluída (14/10)

- Migration rodada no banco. A conferência bateu: tabela antiga removida, `fechar_mes` removida, RPCs DEFINER, dia 6, 4 pendentes, 0 divergências, 0 policies de escrita em compras e pagamentos.
- Vendas e pagamentos feitos pelo app nas fichas 901 e 903 conferem com o saldo, sem divergência.
- Testado pela API real (com alvo inexistente, sem alterar nada): escrita direta em saldo, compras, pagamentos e itens de fechamento é negada (`42501`); pagamento para ficha inexistente dá `CF007`.
- `previa_fechamento` mostra P1 (06/06–05/07) com 3 fichas e R$ 105,00.

### Detalhes da etapa 1

- **Migration** `supabase/migrations/20261014120000_fechamento_contas.sql`, também copiada como seção 6 do `setup-completo.sql`.
  - **Saem** a tabela `fechamentos` e a função `fechar_mes` (decidido em 14/10). Nenhuma coluna é apagada.
  - **Entram** `configuracao`, `configuracao_historico`, `periodos_fechamento`, `fechamento_itens`, `periodo_divergencias`, a view `v_atraso_fichas` e as funções `proximos_periodos`, `previa_fechamento`, `verificar_divergencias`, `fechar_periodo`, `simular_troca_dia`, `definir_dia_fechamento` e auxiliares.
  - `registrar_compra` e `registrar_pagamento` passam a SECURITY DEFINER. O pagamento que zera o saldo quita os itens abertos.
  - **Permissões endurecidas:** só as RPCs escrevem saldo, compras, pagamentos e fechamento. `anon` não executa nada.
- **Front:** saiu a seção "Fechamento Mensal" de Relatórios e o `useFechamentos.ts`. `types.ts` foi atualizado.
- **Testes:** `src/test/banco/fechamento.test.ts`, com 34 testes num Postgres em memória (PGlite 0.2.17, devDependency). Todos passam, junto com os de ambiente: 45 de 45. `tsc` limpo.

## Etapa 2a — Badge centralizado: concluída (14/10)

- `src/components/EstadoContaBadge.tsx` substitui os três badges repetidos: lista de Fichas, título do detalhe e seletor da Nova Venda.
- **Visual idêntico:** as classes CSS conferidas no navegador são as mesmas de antes nos três lugares. `tsc` limpo.

## Próxima etapa

- **2b** — badge sólido nos 3 lugares, `AtrasoChip`, `classeLinhaAtraso` e o card da etapa 2 da Nova Venda extraído (`FichaSelecionadaCard`). Ela só começa quando você pedir.

## Git

- **Branch:** `feature/account-closing`.
- **Último commit:** `1d775a3 before compacting the session`.
- **Pendente de commit:** etapas A, 1 e 2a, o plano v6, este arquivo e o `CLAUDE.md`.

## Decisões em aberto

1. Login desligado + `host: "::"`: **por último**, depois que todos os testes passarem, como primeiro passo da etapa 4 (decidido em 14/10).
2. Pasta de desenvolvimento separada (`git worktree`): só depois da entrada em uso.
