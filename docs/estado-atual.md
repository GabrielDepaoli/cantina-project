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

## Etapa 2b — Visual do estado e peças do atraso: concluída (14/10)

- **Badge sólido nos 3 lugares:** verde escuro "Ativo" e vermelho "Bloqueada", com texto branco. No seletor da Nova Venda, o âmbar virou vermelho.
- `AtrasoChip` e `classeLinhaAtraso` (`src/components/AtrasoChip.tsx`), com tokens `atraso-1..3` em `index.css` e `tailwind.config.ts`. Ainda não aparecem em nenhuma tela (isso é a 2e).
- `FichaSelecionadaCard` extraído do `NovaVendaDialog`, sem mudança visual. Já aceita `atraso`, ainda não ligado.
- **Verificado:**
  - contraste AA no navegador: Ativo 5,98; Bloqueada 4,8; atraso 1/2/3 = 5,99 / 6,23 / 5,21;
  - lista, detalhe da 906, seletor e card da 907 conferidos;
  - 49 testes passando (4 novos do chip);
  - `tsc` limpo.
- Plano: o host do pooler e o caminho local do backup viraram marcadores genéricos. O host antigo continua no histórico do commit `723ead3`; não é segredo.

## Etapa 2c — Hooks do fechamento: concluída (14/10)

- `src/hooks/useFechamentos.ts` reescrito com os hooks de leitura e escrita do fechamento e as funções `buscar*` sem React.
- `src/lib/errosBanco.ts` traduz os erros `CFxxx` do banco, com 2 testes.
- `useDeleteFicha` passa a checar a linha apagada e mostra a mensagem do banco quando a ficha tem fechamento em aberto. O texto de confirmação de exclusão ganhou essa explicação.
- Venda, pagamento e exclusão de ficha invalidam as consultas do fechamento.
- Os tipos de criar e editar ficha só aceitam as colunas liberadas no banco.
- **Verificado contra o banco real**, só leitura:
  - 4 pendentes (06/06 a 05/10) + o período em andamento;
  - prévia com 3 fichas e R$ 105;
  - 0 divergências, 0 atrasos, 0 períodos;
  - dia 6;
  - simulação do dia 20 bloqueada por 4 pendentes.
- **Também:** 51 testes passando, `tsc` limpo e app abrindo sem erro no console.

## Etapa 2d — Aba Fechamento: concluída (14/10)

- **Arquivos:**
  - `src/components/fechamento/` com `AbaFechamento`, `DialogFecharPeriodo`, `LinhaFichaEmAberto`, `HistoricoPeriodos` e `SeloTransicao`;
  - `src/lib/datas.ts`, com 3 testes;
  - aba e contador de pendentes na nav;
  - atalho de espaço ignorado com qualquer dialog aberto.
- **Testado no navegador, contra o banco de desenvolvimento:**
  - os 4 períodos do seed fechados pelo botão, um por clique;
  - prévias de 3, 2, 5 e 6 fichas;
  - atrasos finais iguais à tabela do LEIAME (903: 1; 904, 907 e 908: 2; 905 e 906: 4);
  - a 908 nasceu quitada em 07/07/2026;
  - pagamento de R$ 64 na 903 tirou a ficha de "Em aberto" na hora;
  - excluir a 905 foi recusado com a mensagem do banco;
  - botão desabilitado com o motivo e o contador da nav sumindo quando zera;
  - 0 divergências no fim.
- **54 testes passando e `tsc` limpo.**
- **Estado do banco agora:** 4 períodos fechados e a 903 quitada. Para voltar ao início (4 pendentes), rode `supabase/desenvolvimento/seed.sql`.

## Etapa 2e — Atraso nas telas existentes: concluída (14/10)

- **Lista de Fichas:** faixa lateral + fundo suave + chip nas fichas em aberto.
- **Detalhe:** chip no título, ao lado do badge.
- **Nova Venda, etapa 2:** chip numa linha própria, acima da anotação.
- **Nova Venda, etapa 1:** sem atraso, conferido com 8 fichas listadas e 0 chips.
- **Verificado no navegador:**
  - faixa laranja (2) e vermelha (4) nas fichas certas, e a 903 quitada sem faixa;
  - a 906 com "Bloqueada" sólido e "4 períodos em atraso" no título;
  - a 907 com chip e anotação na venda.
- **54 testes passando e `tsc` limpo.**

## Etapa 2f — Configurações: concluída (15/10)

- **Tela:** `src/components/configuracoes/`, aberta pela engrenagem no header.
  - Dia de fechamento: simulação, confirmação, aviso de transição curta, bloqueios com "Ir para Fechamento" e histórico.
  - Integridade do razão: conferência só de leitura.
- **Verificado no navegador:**
  - simulação do dia 8: transição 06/10–07/10, 2 dias;
  - simulação do dia 20: transição 06/10–19/10, 14 dias;
  - dia 45 recusado;
  - "Conferir agora" sem divergência nas 8 fichas.
- **Erro encontrado na troca real:** `UPDATE requires a WHERE clause`.
  - O Supabase usa a extensão `safeupdate`, que recusa UPDATE sem WHERE pela API, e o PGlite não tem essa extensão.
  - **Correção:** migration `20261014150000_definir_dia_com_where.sql` (também na seção 7 do setup).
  - **Novo teste:** confere que nenhuma função tem UPDATE/DELETE sem WHERE.
  - 55 testes passando.
- Migration de correção rodada no banco em 15/10 e conferida (`prosrc` com `WHERE id`).
- **Troca real testada no navegador** (15/10, depois de rodar o seed e fechar de novo os 4 períodos pelo botão):
  - com pendentes: campo desabilitado, lista dos 4 períodos e "Ir para Fechamento" funcionando;
  - troca 6 → 20 deu certo: transição 06/10–19/10 no histórico;
  - segunda troca bloqueada na tela e na API (`CF009`, mensagem da regra 12);
  - a aba Fechamento mostra "O período de transição 06/10–19/10 pode ser fechado a partir de 20/10/2026".
- **Estado do banco agora:** 4 períodos fechados, dia 20 e transição aberta. Para voltar ao início, rode `supabase/desenvolvimento/seed.sql`.

## Etapa 4 — Entrada em uso: em andamento (branch `feature/security-hardening`)

- **PR #2** (`feature/account-closing` → `main`) mergeado em 15/10.
- **Segurança, decidido em 15/10:**
  - **Rede:** só este computador (`host: "localhost"`).
  - **Login:** a cada abertura do navegador (sessão em `sessionStorage`).
  - **Auto-login:** removido; nenhuma senha vai mais no JavaScript servido.
- **Feito no código:**
  - login obrigatório (`ProtectedRoute` e `AuthContext`), `sessionStorage` e `host: "localhost"`;
  - a validação do `.env` recusa senha ou segredo com prefixo `VITE_`, com teste novo (57 testes passando);
  - verificado: com o `.env` atual, o app para na tela de erro apontando `VITE_DEV_ADMIN_PASSWORD`, e o servidor mostra só o endereço Local.
- **Encontrado:** "Allow new users to sign up" estava **ligado** no Supabase. A contagem confirmou só 1 usuário (`admin@cantina.local`), ou seja, ninguém usou.
- **Resolvido em 15/10:**
  - [x] "Allow new users to sign up" desligado e salvo; a API do Auth confirma `disable_signup: true`.
  - [x] Senha do admin guardada por você; `VITE_DEV_ADMIN_*` apagadas do `.env`, que agora tem só as 3 variáveis do Supabase.
  - [x] **Login verificado:**
    - entrar com `admin` funciona e F5 mantém a sessão;
    - uma aba nova vai para `/login`;
    - Sair leva ao login e apaga a sessão;
    - voltar para `/` redireciona ao login;
    - o token antigo do `localStorage` é apagado ao abrir o app.
  - Troca da senha do admin: você decidiu que não é necessária.
- **Depois:** PR desta branch, `entrada-em-uso.sql` (você), dia de fechamento, checkout da `main` na pasta do caixa e o CLAUDE.md passando a "em produção".

## Etapa 3 — Rodada final de testes: concluída (15/10)

- **Novos scripts:** `supabase/desenvolvimento/carga.sql` (999 fichas, ~45 mil compras, ~5 mil pagamentos) e `medir-fechamento.sql` (fecha numa transação, mede e desfaz). Os dois também têm teste automático.
- **Combinado em 15/10 e registrado no CLAUDE.md:** até a entrada em uso, o assistente roda no SQL Editor (com você logado) leitura e scripts de teste. Migrations e `entrada-em-uso.sql` continuam com você.
- **Resultados no Supabase:**
  - **Volume:** fechar o período mais pesado com 999 fichas (931 itens) levou **360 ms**. O limite do plano é 2.000 ms, então o aviso do diálogo continua discreto. A prévia mostrou 931 fichas e R$ 81.331,51.
  - **Venda durante fechamento:** com todas as fichas travadas por 6 s, a venda esperou e concluiu, sem erro.
  - **Trava de 3 s:** com uma ficha travada por 6 s, o fechamento desistiu em 3,3 s com "Há vendas ou pagamentos em andamento; tente de novo em instantes."
  - **Divergência pela tela:**
    - a conferência em Configurações mostrou a 902, com diferença de +R$ 2,00;
    - o diálogo de fechar mostrou a divergência e exigiu a confirmação;
    - mudar a divergência com a tela aberta deu "A divergência mudou", atualizou a lista para R$ 3 e desmarcou a confirmação;
    - na segunda confirmação, fechou e registrou a divergência (902: banco 3, razão 0) no período e no histórico.
  - **Fluxos do caixa, com as permissões novas:**
    - criar ficha (001), editar nome e CPF, trancar e destrancar, anotar;
    - "somente crédito" barrou a venda sem crédito;
    - pagar R$ 20 e depois vender R$ 10 com crédito;
    - excluir a 001;
    - fechar o 1º período e excluir a 908, que só tinha item quitado: o histórico manteve o item como "(ficha excluída)".
- **Estado do banco agora:** 1 período fechado, a 908 excluída e lançamentos de teste na 901. Para voltar ao início, rode `seed.sql`.

## Etapa 2 — concluída (15/10)

- 2a a 2f prontas e testadas no navegador contra o banco de desenvolvimento.
- **Depois da 3:**
  1. pull request de `feature/account-closing` para a `main`;
  2. etapa **4** (entrada em uso), numa branch nova a partir da `main`, começando pela segurança: login e acesso pela rede.

## Git

- **Branch:** `feature/account-closing`.
- **Commits locais ainda não enviados:** `10ed32d` (2b), `9a8ddf0` (2c), `111d701` (2d), `e37c425` (2e), `a4d05a1` (2f) e o ajuste final da 2f. `723ead3` (A, 1 e 2a) já está no remoto.
- **Combinado (14/10):** commit ao fim de cada sub-etapa da 2; push só depois da sua confirmação, ao terminar a 2.

## Decisões em aberto

1. Login desligado + `host: "::"`: **por último**, depois que todos os testes passarem, como primeiro passo da etapa 4 (decidido em 14/10).
2. Pasta de desenvolvimento separada (`git worktree`): só depois da entrada em uso.
