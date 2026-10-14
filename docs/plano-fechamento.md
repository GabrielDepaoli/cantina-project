# Plano — Área de Fechamento de Contas (v6)

> **v6 (14/10/2026) muda a premissa do plano:**
> - **O sistema ainda não está em uso.** As fichas do banco (#001–#009) são de teste. Nenhum dado é real.
> - **Ambiente único.** Um só projeto Supabase (`yqhiazfknioaxlyzobrz`) serve para desenvolver e testar. Na entrada em uso, ele é limpo e passa a ser o banco real. O projeto `cantina-staging` sai.
> - **Saem**, porque não há histórico real a preservar:
>   - a etapa B (backup e restauração) e as etapas 0/0b (pré-checagem e correção de divergências);
>   - o backup antes de cada etapa e o rollback por etapa;
>   - o tratamento do legado `fechamentos`;
>   - a galeria visual (o seed no banco único já mostra todos os casos);
>   - as migrations separadas por etapa.
> - **O banco final nasce de uma migration só**, já com SECURITY DEFINER e RLS endurecida.
> - **Os testes do banco ficam automáticos** (Vitest + PGlite) e rodam nesta máquina, sem acesso ao banco.
> - **Ficam** todas as regras de negócio e o desenho de tela da v5.
>
> A v5 completa continua no histórico do git (commit `1d775a3`, neste mesmo arquivo).

> Plano de desenho. Cada etapa só começa quando o usuário pedir.

## Contexto

Hoje o fechamento é a RPC `fechar_mes(p_mes_referencia)`, chamada pelo botão "Fechar Mês Atual" na aba Relatórios.
- Ela agrupa por mês-calendário (texto `YYYY-MM`).
- O `total` é a soma das compras do mês.
- O `valor_pago` casa os pagamentos pela **data** dentro do mês. Por isso aparece "Pago: R$ 0" quando alguém paga em outubro a dívida de setembro.
- Ela filtra pelo campo legado `status = 'ativo'`.

O objetivo é trocar isso por fechamentos de **período com datas reais**:
- o período segue um dia-âncora configurável;
- o fechamento é manual, um período por clique, sempre do mais antigo pendente;
- o saldo de cada ficha é **reconstruído pelo razão** até a data de corte;
- o item fica em aberto até o saldo da ficha chegar a ≤ 0, e o atraso (1, 2, 3+) aparece na UI.

Junto com isso, todas as RPCs passam a SECURITY DEFINER e a RLS fica endurecida desde o início.

## Regras consolidadas (decididas)

1. **Conta corrente.** Pagamento não se vincula a compra nem a fechamento.
2. **Período.**
   - A âncora é o dia N. O período vai do dia N até a véspera do dia N do mês seguinte.
   - Em mês curto, se o dia N não existe, usa o último dia do mês, sem deslocar a âncora dos meses seguintes. Com N=31: 31/01–27/02, 28/02–30/03, 31/03–29/04.
   - O período é guardado como `date`.
3. **Invariante de encadeamento.** O `data_inicio` de um período é sempre o `data_fim` do anterior + 1 dia. Nunca existe buraco nem sobreposição. O banco impõe isso.
4. **Disparo manual, um período por clique, sempre o mais antigo pendente.**
   - Só fecha período que já terminou: `data_fim < hoje`, no fuso America/Sao_Paulo.
   - Nunca fecha período anterior ao que contém a primeira compra do sistema.
   - A UI mostra qual período será fechado e quantos ficam pendentes.
   - Quando não há o que fechar, o botão fica desabilitado, com um tooltip explicando o motivo.
5. **Saldo congelado = razão até o corte.**
   - O corte de um período é `(data_fim + 1)` às 00:00 de São Paulo.
   - Só gera item quando o saldo no corte é > 0.
   - O valor congelado é histórico e nunca é recalculado.
6. **Quitação.**
   - **Na criação do item:** percorre o razão a partir do corte e procura o primeiro instante em que o saldo ficou ≤ 0. Se esse instante existe, o item já nasce quitado com aquela data. Se não, nasce em aberto.
   - **Depois de criado:** `registrar_pagamento` quita atomicamente todos os itens abertos da ficha quando o `saldo_atual` chega a ≤ 0.
   - Não existe quitação parcial.
7. **Atraso** = quantos fechamentos se passaram desde o item aberto mais antigo, contando o período desse item.
   - 1 = amarelo, 2 = laranja, 3 ou mais = vermelho.
   - Pular vários níveis de uma vez é o comportamento correto.
   - O rótulo **sempre traz o número em texto**, para não depender só da cor.
   - Atraso **nunca bloqueia venda**. Só `bloqueada` bloqueia.
8. **As listas mostram o `saldo_atual` ao vivo** (`formatSaldo`). O valor congelado aparece só no histórico.
9. **Divergência entre razão e saldo.**
   - Em todo fechamento, compara o razão completo até agora com o `saldo_atual`, ficha a ficha.
   - Se divergir, a RPC recusa. A UI lista as fichas divergentes e pede confirmação explícita.
   - A confirmação fica registrada em `periodo_divergencias`, com as fichas e os valores.
   - A checagem também roda **avulsa**, sem fechar período, na tela de Configurações. Ali ela só exibe e nunca corrige.
   - Com RPCs DEFINER e a RLS endurecida desde o início, divergência só aparece se alguém alterar dados direto pelo SQL Editor. A checagem continua como proteção para depois da entrada em uso.
10. **Sem legado.** A tabela `fechamentos` e a RPC `fechar_mes` são removidas: os fechamentos que existem são de teste. A coluna `compras.fechado` fica, sem uso. (Na v5, o legado ficava só de leitura.)
11. **Excluir ficha.**
    - Fica bloqueado enquanto houver item em aberto.
    - Fora isso, o histórico é mantido com número e nome congelados no item.
12. **Troca do dia-âncora.**
    - **Bloqueada enquanto houver período encerrado pendente de fechamento**, no banco e na UI.
      - A tela explica quantos períodos estão pendentes e quais são, com as datas, e diz que é preciso fechá-los antes.
      - Traz um link direto para a aba Fechamento.
    - Sem pendentes, a troca gera um período de **transição**.
      - Ele vai do dia seguinte ao `data_fim` do último período fechado até a véspera da primeira ocorrência do novo dia a partir dessa data. Por isso nunca passa de ~31 dias.
      - Se o dia seguinte já for uma ocorrência do novo dia, não há transição.
      - Se nenhum período foi fechado ainda, a troca só recalcula a cadeia a partir da primeira compra, sem transição.
    - O período de transição fica gravado com marcação própria e aparece rotulado na UI.
    - A troca não mexe em período já fechado, não recalcula valor congelado e não altera item quitado.
    - Antes de salvar, a tela mostra o período de transição em texto (início, fim e número de dias) e pede confirmação.
    - Há aviso extra **só para transição com menos de 7 dias**.
    - Toda troca entra no histórico de auditoria: data, valor antigo, valor novo e usuário.
    - **A invariante da regra 3 vale atravessando a transição.**
    - **Uma segunda troca fica bloqueada enquanto a transição da anterior não for fechada.**
      - "Transição aberta": a última linha de `configuracao_historico` gerou uma transição (`transicao_inicio` não nulo) e ainda não existe período fechado com esse `data_inicio`.
      - O bloqueio é imposto em `definir_dia_fechamento` e na tela. Mensagem: "A troca anterior (dia X → Y) gerou a transição DD/MM–DD/MM, que ainda não foi fechada. Feche-a quando terminar (a partir de DD/MM) e então troque o dia."
13. **Onde o atraso aparece:** na lista de Fichas, no detalhe da ficha e na etapa 2 da Nova Venda.
    - **Não** aparece na busca da etapa 1.
    - Não pode competir com o badge Ativo/Bloqueada (ver "Front").

## Schema final

Tudo vai numa migration única, `supabase/migrations/<data>_fechamento_contas.sql`, aplicada sobre o banco atual. O `setup-completo.sql` é reescrito com o schema final e o `types.ts` é atualizado.

**Removido:** a tabela `fechamentos`, a função `fechar_mes` e as policies de escrita direta em `compras` e `pagamentos`. **Nenhuma coluna é apagada** (decidido em 14/10): `fiadores.status`, `fiadores.telefone` e `compras.fechado` ficam, sem uso.

```sql
CREATE TABLE public.configuracao (
  id             boolean PRIMARY KEY DEFAULT true CHECK (id),                         -- (1)
  dia_fechamento smallint NOT NULL DEFAULT 6 CHECK (dia_fechamento BETWEEN 1 AND 31), -- (2)
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.configuracao DEFAULT VALUES;

CREATE TABLE public.configuracao_historico (                                   -- regra 12, auditoria
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alterado_em      timestamptz NOT NULL DEFAULT now(),
  alterado_por     uuid DEFAULT auth.uid(),
  dia_anterior     smallint NOT NULL,
  dia_novo         smallint NOT NULL,
  transicao_inicio date,              -- período de transição mostrado e confirmado
  transicao_fim    date,
  aviso_confirmado boolean NOT NULL DEFAULT false   -- confirmou o aviso de transição < 7 dias
);

CREATE TABLE public.periodos_fechamento (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_anterior_id uuid UNIQUE REFERENCES public.periodos_fechamento(id) ON DELETE RESTRICT, -- (3)
  data_inicio         date NOT NULL,
  data_fim            date NOT NULL,                          -- inclusiva
  dia_ancora          smallint NOT NULL,                      -- âncora vigente
  transicao           boolean NOT NULL DEFAULT false,         -- regra 12
  fechado_em          timestamptz NOT NULL DEFAULT now(),
  fechado_por         uuid DEFAULT auth.uid(),
  CONSTRAINT periodo_datas_validas CHECK (data_fim >= data_inicio),            -- (4)
  CONSTRAINT periodo_inicio_unico  UNIQUE (data_inicio),                       -- (5)
  CONSTRAINT periodo_sem_sobreposicao
    EXCLUDE USING gist (daterange(data_inicio, data_fim, '[]') WITH &&)        -- (6)
);
CREATE UNIQUE INDEX periodo_raiz_unica ON public.periodos_fechamento ((true))
  WHERE periodo_anterior_id IS NULL;                                           -- (7)
-- trigger BEFORE INSERT: data_inicio = anterior.data_fim + 1  e  anterior = último período (8)

CREATE TABLE public.fechamento_itens (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id               uuid NOT NULL REFERENCES public.periodos_fechamento(id) ON DELETE RESTRICT, -- (9)
  fiador_id                uuid REFERENCES public.fiadores(id) ON DELETE SET NULL,                      -- (10)
  numero_ficha             text NOT NULL,
  nome_aluno               text NOT NULL,                                       -- (10) congelados
  saldo_congelado          numeric(10,2) NOT NULL CHECK (saldo_congelado > 0),  -- (11)
  quitado_em               timestamptz,
  quitado_por_pagamento_id uuid REFERENCES public.pagamentos(id) ON DELETE SET NULL, -- (12)
  CONSTRAINT item_unico_por_periodo UNIQUE (periodo_id, fiador_id)              -- (13)
);
CREATE INDEX idx_itens_abertos_por_fiador ON public.fechamento_itens (fiador_id) WHERE quitado_em IS NULL; -- (14)
CREATE INDEX idx_itens_por_periodo        ON public.fechamento_itens (periodo_id);
CREATE INDEX idx_compras_fiador_data      ON public.compras (fiador_id, data);  -- (15)
-- trigger BEFORE DELETE ON fiadores: RAISE se existir item aberto da ficha (16)

CREATE TABLE public.periodo_divergencias (                                     -- regra 9
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id   uuid NOT NULL REFERENCES public.periodos_fechamento(id) ON DELETE RESTRICT, -- (17)
  fiador_id    uuid REFERENCES public.fiadores(id) ON DELETE SET NULL,
  numero_ficha text NOT NULL,                                   -- congelado
  nome_aluno   text NOT NULL,                                   -- congelado
  saldo_atual  numeric(10,2) NOT NULL,                          -- valor em fiadores no instante
  saldo_razao  numeric(10,2) NOT NULL,                          -- Σ compras − Σ pagamentos no instante
  CONSTRAINT divergencia_real CHECK (saldo_atual <> saldo_razao),  -- (18)
  CONSTRAINT divergencia_unica UNIQUE (periodo_id, fiador_id)      -- (19)
);
```

**Por que cada constraint existe:**

1. Garante uma única linha de configuração.
2. Aceita 1–31. Os dias que não existem no mês seguem a regra do último dia.
3. Cada período tem no máximo um sucessor. Junto com (7), isso faz dos períodos uma **cadeia linear**.
4. Impede datas invertidas.
5. **Clique duplo.** O segundo `INSERT` do mesmo período espera o primeiro commitar e falha com 23505, que a RPC traduz para "Período já fechado". Funciona até entre computadores diferentes.
6. Defesa extra contra sobreposição, caso o trigger tenha bug. É nativo do Postgres.
7. Só um período pode ser a raiz da cadeia.
8. **Invariante de encadeamento** (regra 3) imposta no banco.
9. Período com itens nunca pode ser apagado.
10. Regra 11: número e nome ficam congelados no item.
11. Regra 5: só existe item com saldo devedor.
12. Auditoria: qual pagamento quitou o item.
13. Uma ficha por período.
14. Deixa rápidos a quitação e o cálculo de atraso.
15. Deixa rápida a reconstrução do razão por ficha e data. `pagamentos` já tem o índice `(fiador_id, data)`.
16. Regra 11 imposta no banco.
17. A divergência aceita nunca é apagada junto com o período.
18. Impede gravar uma "divergência" que não diverge.
19. Uma linha por ficha e período.

**Por que divergência é tabela filha, e não `boolean` nem `jsonb`.**
- Um `boolean` diria só que houve aceitação, não o que foi aceito.
- Um `jsonb` não teria tipo nem constraint.
- A tabela filha tem colunas tipadas e pode ser consultada com JOIN. A diferença `saldo_atual − saldo_razao` é calculada na leitura.

**View** (`security_invoker = true`):
- `v_atraso_fichas`: `fiador_id`, `desde` e `atraso`. O atraso conta os períodos com `data_inicio` maior ou igual ao do item aberto mais antigo.

## RPCs

Todas as RPCs de escrita seguem o mesmo padrão:
- `SECURITY DEFINER`;
- `SET search_path = public, pg_temp`;
- `REVOKE EXECUTE … FROM PUBLIC, anon` e `GRANT EXECUTE … TO authenticated`;
- depois de todo UPDATE que precisa atingir uma linha, `GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE`.

**`registrar_compra`**
- Primeiro `UPDATE fiadores … RETURNING saldo_atual`, que trava a ficha. Depois o `INSERT` no razão.
- A assinatura e o retorno não mudam, então o front não muda.

**`periodo_de(p_data date, p_dia smallint)`** (IMMUTABLE)
- Âncora do mês: `make_date(ano, mes, least(p_dia, último dia do mês))`.
- Retorna o período regular que contém `p_data`.

**`proximos_periodos()`** (STABLE)
- Lista os pendentes a partir do último período fechado, ou a partir de `periodo_de(primeira compra)` se não houver nenhum.
- Se o próximo início não cai na âncora atual, o próximo período é de **transição**.
- Gera períodos enquanto `data_fim < hoje` (em SP).
- Retorna `data_inicio`, `data_fim`, `transicao` e `ordem`.

**`verificar_divergencias()`** (STABLE, só leitura)
- Retorna `fiador_id`, `numero_ficha`, `nome_aluno`, `saldo_atual` e `saldo_razao` das fichas em que os dois valores diferem.
- É a mesma função dentro do `fechar_periodo` e na conferência avulsa.

**`fechar_periodo(p_data_inicio date, p_divergencias_confirmadas jsonb DEFAULT '[]')`**
1. Define `SET LOCAL lock_timeout = '3s'`.
2. Trava a linha de `configuracao` com `FOR UPDATE`.
3. Trava todas as fichas com `PERFORM 1 FROM fiadores ORDER BY id FOR UPDATE`. A ordem fixa evita deadlock. Como compra e pagamento travam a ficha antes de gravar, nada entra no razão durante o fechamento.
4. Confere se `p_data_inicio` é o primeiro de `proximos_periodos()`. Se não for, levanta erro.
5. Recalcula `verificar_divergencias()` já com as fichas travadas e compara com o que o operador confirmou:
   - sem divergência: segue;
   - divergência idêntica à confirmada (mesmas fichas, mesmos valores): segue;
   - divergência diferente, inclusive vazio contra não vazio: levanta um erro com código próprio e devolve a lista atual, que o front mostra para nova confirmação.
6. Insere em `periodos_fechamento`. Erro 23505 ou 23P01 vira "Período já fechado".
7. Se houve divergência aceita, insere em `periodo_divergencias`.
8. Monta os itens:
   - `saldos` = razão com `data < corte`, só os > 0;
   - `eventos` = compras (+) e pagamentos (−) com `data >= corte`;
   - saldo acumulado por janela, ordenado por data, depois tipo (compra antes de pagamento no mesmo instante), depois id;
   - o primeiro evento com acumulado ≤ 0 dá `quitado_em` e `quitado_por_pagamento_id`;
   - `INSERT fechamento_itens` com número e nome congelados.
9. Retorna o período criado.

**Custo do lock**
- Com 10–20 fichas, o fechamento leva dezenas de milissegundos. No pior caso (999 fichas, ~50 mil lançamentos), fica abaixo de 1 s. É estimativa: medir no banco de desenvolvimento com `carga.sql`.
- Uma venda disparada durante o fechamento **espera** e conclui. Ela só falharia passando do `statement_timeout` de 8 s.
- Se as travas não vierem em 3 s, o `fechar_periodo` desiste com "Há operações em andamento; tente de novo em instantes".
- O diálogo de confirmação sempre diz: "Durante o fechamento, vendas e pagamentos ficam aguardando por um instante. Prefira fechar fora do horário de movimento." Se a medição passar de 2 s, esse texto vira aviso em âmbar.
- **Sem deadlock:** `registrar_*` trava uma ficha só. `fechar_periodo` trava a configuração e depois todas as fichas, sempre em ordem de `id`.

**`registrar_pagamento`** (ganha a quitação; a pós-condição vale **só no ramo de saldo ≤ 0**)

```sql
UPDATE fiadores SET saldo_atual = saldo_atual - p_valor
 WHERE id = p_fiador_id RETURNING saldo_atual INTO v_saldo;
GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE 'Ficha não encontrada'; END IF;

INSERT INTO pagamentos (...) RETURNING * INTO v_pag;

IF v_saldo <= 0 THEN
  UPDATE fechamento_itens
     SET quitado_em = now(), quitado_por_pagamento_id = v_pag.id
   WHERE fiador_id = p_fiador_id AND quitado_em IS NULL;
  -- pós-condição: SÓ AQUI. Com o saldo ≤ 0, não pode restar item aberto.
  IF EXISTS (SELECT 1 FROM fechamento_itens
              WHERE fiador_id = p_fiador_id AND quitado_em IS NULL) THEN
    RAISE 'Quitação incompleta da ficha %', p_fiador_id;
  END IF;
END IF;
-- saldo > 0 (pagamento parcial): não toca nos itens. O item continua aberto (regra 6).
RETURN v_pag;
```

**`simular_troca_dia(p_dia smallint)`** (STABLE)
- Retorna `bloqueado`, os pendentes com datas, a transição aberta (se houver), `transicao_inicio`, `transicao_fim`, `dias`, `sem_transicao` e `aviso_curta`.

**`definir_dia_fechamento(p_dia smallint, p_confirmar_aviso boolean DEFAULT false)`**
1. Trava a linha de `configuracao`.
2. Se `proximos_periodos()` não vier vazio, levanta "Há N período(s) pendente(s): …".
3. Se houver transição aberta, levanta a mensagem da regra 12.
4. Se a transição for curta e o aviso não vier confirmado, levanta erro.
5. `UPDATE configuracao`, exigindo `ROW_COUNT = 1`.
6. Grava em `configuracao_historico`.
- A transição não é gravada nessa hora: ela vira período quando for fechada.

## Segurança: estado final da escrita

O SQL Editor roda como `postgres`, dono das tabelas, e não é afetado por nada disto.

| Caminho | Estado final |
|---|---|
| `useUpdateFicha` (nomes, celulares, CPFs, responsável 2, `bloqueada`, `somente_credito`, `observacoes`) | UPDATE direto, com `GRANT UPDATE` **por coluna** só nessas colunas. O tipo do hook passa a ser um `Pick<>`. |
| `useCreateFicha` | INSERT direto, com `GRANT INSERT` por coluna, **sem** `saldo_atual`. |
| `useDeleteFicha` | DELETE direto, com o trigger da regra 11. Passa a usar `.select()` e falha se não apagou exatamente 1 linha. |
| `registrar_compra`, `registrar_pagamento` e as RPCs novas | DEFINER, únicos escritores do razão e das tabelas novas. |
| `compras` e `pagamentos` | Só SELECT para `authenticated`. Nenhuma policy de INSERT, UPDATE ou DELETE. |
| Tabelas novas | Só SELECT. Uma policy de UPDATE permitiria forjar quitações pela API. |
| Trigger `update_fiadores_updated_at` | Fica. Privilégio por coluna só vale para as colunas do `SET`. |

- O `REVOKE EXECUTE … FROM PUBLIC, anon` é obrigatório. Sem ele, quem tem a chave pública (que está no repo) poderia escrever através das RPCs DEFINER.
- Confirmar que "Allow new users to sign up" está desligado.

**Dados de teste depois do endurecimento:** compras e pagamentos sempre pela RPC, também no SQL Editor:
```sql
SELECT registrar_compra('<id>', 'Teste', 10, to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM'));
SELECT registrar_pagamento('<id>', 10, 'Teste');
```
Um INSERT direto como `postgres` continua possível, mas cria divergência entre razão e saldo.

## Fechamento duplicado

A garantia é composta por:
- `UNIQUE(data_inicio)`, `UNIQUE(periodo_anterior_id)`, a raiz única, o `EXCLUDE` e o trigger de encadeamento;
- `UNIQUE(periodo_id, fiador_id)`;
- a trava em `configuracao` e a exigência de "primeiro pendente";
- o botão desabilitado durante o `isPending`.

## Front

**Aba "Fechamento"**, que absorve a seção de Relatórios:
- **Sai de `Index.tsx`:** a seção "Fechamento Mensal", `useFechamentos`/`useFecharMes` e o `mesAtualRef` em UTC. A aba Relatórios fica só com os cards.
- **Cabeçalho:** "Próximo a fechar: DD/MM–DD/MM", com o selo **"transição"** quando for o caso, e "· N pendente(s)".
- **Botão "Fechar período…".** Abre uma confirmação com:
  - o número de fichas e o total que será congelado;
  - as divergências, se houver, com os dois saldos lado a lado;
  - a linha sobre vendas aguardando.

  O botão fica desabilitado, com tooltip, quando não há nada a fechar e durante o `isPending`.
- **Em aberto:** cada ficha com o saldo ao vivo e o rótulo de atraso.
- **Histórico:** períodos expansíveis, com selo de transição. Cada ficha mostra o valor "no fechamento" e "quitado em DD/MM/AAAA" ou "em aberto".
- **Badge de pendência** na aba da navegação.
- **Espaços reservados para o que está fora do escopo**, sem botões de mentira:
  - `LinhaFichaEmAberto` com `acoes?: ReactNode` (futuro: cobrar via WhatsApp, copiar extrato);
  - `extrasCabecalho?: ReactNode` no cabeçalho (ações em lote);
  - `indicadores?: ReactNode` entre o cabeçalho e as listas (dashboard de inadimplência).
  - `useAtrasos` e `usePeriodos` já devolvem ficha, telefone do responsável, saldo ao vivo, atraso e períodos em aberto.

**Tela "Configurações"** (novo valor `configuracoes` no `view`, aberto por um ícone de engrenagem no header):
- **Dia-âncora (1–31):**
  - Fica desabilitado se houver período pendente ou transição aberta, com a explicação e o link "Ir para Fechamento".
  - Antes de salvar, mostra "Transição de DD/MM a DD/MM (X dias)" ou "Sem transição" e pede confirmação. Transição com menos de 7 dias pede uma confirmação extra.
- **Histórico de trocas.**
- **"Integridade do razão":**
  - botão "Conferir agora", só leitura;
  - sem divergência: "Nenhuma divergência — razão e saldo batem em todas as N fichas. Conferido às HH:MM.";
  - com divergência: tabela Ficha | Nome | Saldo no banco | Saldo pelo razão | Diferença, com os saldos em `formatSaldo` e a diferença bruta, com sinal;
  - **nenhum botão de corrigir**, e um texto fixo dizendo que a correção é manual, via SQL;
  - lista também os períodos fechados com divergência aceita.

**Badge de estado da conta**, hoje duplicado em `Index.tsx`, `FichaDetalheDialog.tsx` e `NovaVendaDialog.tsx`:
1. Criar `src/components/EstadoContaBadge.tsx` e trocar os três lugares, ainda com o visual atual.
2. Depois, visual **sólido** nos três: fundo cheio e texto branco, verde "Ativo" e vermelho "Bloqueada". O âmbar do seletor da Nova Venda vira vermelho sólido.

**Rótulo de atraso:** `src/components/AtrasoChip.tsx` e o helper `classeLinhaAtraso(nivel)`.
- A **forma** distingue as duas informações:
  - **badge sólido** = estado da conta;
  - **chip com relógio e "N período(s) em atraso"** = atraso, sempre com o número escrito;
  - **faixa lateral de 4px e fundo bem suave** na linha da lista de Fichas = atraso.
- Contraste AA verificado no nome, no saldo e no chip, nos três níveis. O fundo da linha fica em ~5% de opacidade.
- **Detalhe da ficha:** chip no título, ao lado do badge.
- **Nova Venda, etapa 2:** chip numa linha própria, acima da anotação. Chip contra texto e relógio contra nota separam os dois. O atraso não bloqueia nada.
- **Nova Venda, etapa 1:** sem atraso.

Pior caso na lista:
```
▌ #003  Morel                                    -R$ 125.00
▌       ⏱ 3 períodos em atraso                 [█ Bloqueada █]
```

**Hooks** em `src/hooks/useFechamentos.ts`, reescrito:
- `useProximosPeriodos`, `useDivergencias`, `useFecharPeriodo`, `usePeriodos`, `useAtrasos` (um `Map` por ficha), `useConfiguracao`, `useSimularTrocaDia` e `useDefinirDia`.
- `useRegistrarPagamento` passa a invalidar também os períodos e os atrasos.
- O erro do trigger da regra 11 vira "A ficha tem fechamento em aberto; quite antes de excluir".

## Ambiente único e dados de teste

- **Um projeto só:** `yqhiazfknioaxlyzobrz`, o mesmo do `.env`. O `cantina-staging` pode ser excluído do painel, e o `.env.staging.local` apagado.
- **No front (etapa A):**
  - **Sai** o modo staging: o script `dev:staging`, a faixa e a etiqueta de ambiente, as regras de staging em `ambiente.ts` e as entradas de staging no `.claude/launch.json`.
  - **Fica** a validação do `.env` com a tela de erro (URL e chave obrigatórias, sem caminho na URL, PROJECT_ID diferente da URL dá erro).
- **No banco:** `supabase/staging/` vira `supabase/desenvolvimento/`.
  - `00-marcador.sql` cria `_ambiente = 'desenvolvimento'`. Deixa de recusar banco com fichas, porque o banco único já tem as 9 fichas de teste. Passa a recusar se existir `_em_uso`.
  - `seed.sql` e `reset.sql` recusam se faltar o marcador **ou** se existir `_em_uso`.
  - O seed troca as 9 fichas de teste pelas 901–908:

    | Ficha | Situação | Resultado esperado |
    |---|---|---|
    | 901 | Compra só no período corrente | Sem atraso |
    | 902 | Bloqueada, sem dívida antiga | Badge sólido, sem atraso |
    | 903 | Compra em P4 não paga | Atraso 1 |
    | 904 | Compra em P3 não paga | Atraso 2 |
    | 905 | Compra em P1 não paga | Atraso 3+ |
    | 906 | Igual à 905, porém bloqueada | Pior caso visual |
    | 907 | Compra em P3 não paga, com anotação | Anotação + atraso na Nova Venda |
    | 908 | Compra em P1, pagamento que zera em P2, compra em P3 | Item de P1 nasce quitado; P3 em aberto (atraso 2) |

  - O seed não fecha nenhum período. Os 4 pendentes são fechados pelo botão, um por clique.
- **`entrada-em-uso.sql`:** exige o marcador, faz `TRUNCATE` de todos os dados, apaga `_ambiente` e cria `_em_uso` com a data. Depois disso, marcador, seed e reset recusam para sempre.

## Testes

1. **Banco, automático** (Vitest + PGlite, rodando aqui, sem acesso ao banco):
   - Carregam o `setup-completo.sql` num Postgres em memória, com stubs do schema `auth` e dos papéis `anon` e `authenticated`.
   - Exigem `@electric-sql/pglite` como devDependency.
   - Viram casos de teste:
     - **Pendentes:** começam na primeira compra, não incluem período não terminado e respeitam a âncora em mês curto (N=31 em fevereiro e em mês de 30 dias).
     - **Valores:** dois fechamentos em sequência gravam valores diferentes; quem deveu, quitou e voltou a dever tem o item antigo nascendo quitado.
     - **Clique duplo** dá "Período já fechado".
     - **Encadeamento:** INSERT com buraco ou sobreposição é rejeitado; a cadeia não tem buraco, inclusive atravessando transição.
     - **Troca de dia:** é bloqueada com pendente e com transição aberta; a simulação está certa; o aviso aparece para transição < 7 dias; o histórico grava; o que já foi fechado não muda.
     - **Divergência:** com divergência forçada, o fechamento recusa; confirmação idêntica fecha e grava as linhas; confirmação diferente recusa de novo; a conferência avulsa não altera nada.
     - **Quitação:** pagamento parcial com item aberto passa sem erro e não quita; pagamento parcial sem item passa; pagamento que zera quita todos; pagamento que deixa crédito quita todos.
     - **Exclusão:** bloqueada com item aberto e permitida com tudo quitado, mantendo o histórico congelado.
     - **Permissões:** RPC como `anon` é negada; UPDATE direto em `saldo_atual`, em `fechamento_itens` e INSERT direto em `compras` são negados como `authenticated`.
     - **Proteções do seed:** marcador, seed e reset recusam com `_em_uso`.
   - Se o PGlite não suportar papéis ou `SET ROLE`, os testes de permissão ficam manuais, no SQL Editor com o seletor de role.
2. **Banco, manual** (o PGlite tem uma conexão só): venda durante o fechamento, `lock_timeout` de 3 s e medição com `carga.sql`.
3. **`npx tsc --noEmit -p tsconfig.app.json`** depois de cada mudança.
4. **Navegador**, contra o banco com seed: badge e tooltip de pendência, selo de transição, pior caso visual nos três lugares, etapa 1 sem atraso, venda liberada com atraso, saldo ao vivo, fechar os 4 períodos um por clique, e os fluxos do caixa (criar, editar, trancar, anotar, somente-crédito, vender, pagar, excluir ficha quitada).

## Etapas

| Etapa | Conteúdo | Pronto quando |
|---|---|---|
| **A** | Ambiente único: remover o modo staging do front, renomear e ajustar os scripts para `supabase/desenvolvimento/`, atualizar CLAUDE.md e LEIAME. **Você:** excluir o `cantina-staging`, apagar o `.env.staging.local`, rodar o marcador e o seed no banco único. | `npm run dev` abre sem faixa nem etiqueta; testes de ambiente passam; as fichas 901–908 aparecem. |
| **1** | Banco: migration única, `setup-completo.sql` final, `types.ts`, testes PGlite. No mesmo passo, sai a seção "Fechamento Mensal" de Relatórios e o `useFecharMes`, para o app nunca chamar uma função removida. **Você:** rodar a migration no SQL Editor e o seed de novo. | Testes PGlite passam; venda e pagamento funcionam no app. |
| **2a** | `EstadoContaBadge` centralizado, com o visual atual. | Nada mudou na tela. |
| **2b** | Visual sólido do badge, `AtrasoChip`, `classeLinhaAtraso`, `FichaSelecionadaCard` extraído do `NovaVendaDialog`. | Badge sólido nos 3 lugares. |
| **2c** | Hooks novos, `useDeleteFicha` com checagem e invalidações. | `tsc` limpo. |
| **2d** | Aba Fechamento com as áreas reservadas e o badge de pendência. | Fecha os 4 períodos do seed. |
| **2e** | Atraso na lista de Fichas, no detalhe e na etapa 2 da Nova Venda. | Os 8 casos do seed aparecem como na tabela. |
| **2f** | Tela de Configurações. | Bloqueios, simulação, histórico e conferência funcionando. |
| **3** | Rodada final de testes (seção "Testes", completa). | Tudo verde, e você conferiu no navegador. |
| **4** | Entrada em uso (abaixo). | O caixa roda com o banco limpo. |

- Cada etapa termina com `tsc`, verificação no navegador e a tela funcionando.
- 2a e 2b não dependem da etapa 1.
- 2d, 2e e 2f são sequenciais, porque todas mexem em `Index.tsx`.

## Entrada em uso (etapa 4)

1. Resolver antes as decisões pendentes de segurança (abaixo).
2. Anotar o commit que vai para o caixa.
3. Rodar no SQL Editor `supabase/desenvolvimento/entrada-em-uso.sql`: apaga todos os dados de teste e trava seed e reset para sempre.
4. Definir o dia-âncora em Configurações.
5. Conferir: só o usuário admin, signup desligado e uma senha forte.
6. Atualizar o CLAUDE.md: o sistema **passa a estar em produção com dados reais**. A partir daí voltam a valer:
   - **backup antes de toda migration**, com o procedimento abaixo;
   - as fichas 997/998/999 para testes pontuais;
   - não editar nem trocar de branch na pasta do caixa durante o expediente (HMR).
7. Decidir se cria um ambiente separado para mudanças futuras. É ele que permite testar a restauração do backup.

**Backup, a partir da entrada em uso** (comandos já conferidos nesta máquina; PostgreSQL 17 instalado, só as ferramentas de linha de comando):

```powershell
$s = Read-Host 'Senha do banco' -AsSecureString          # rodar sozinha; não vai para o histórico
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
$pg   = 'C:\Program Files\PostgreSQL\17\bin'
$conn = 'host=aws-0-sa-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.yqhiazfknioaxlyzobrz sslmode=require'
$dir  = 'C:\Users\depao\Backups\cantina'                  # FORA do repositório
$data = Get-Date -Format 'yyyyMMdd-HHmm'
New-Item -ItemType Directory -Force $dir | Out-Null
& "$pg\psql.exe" -d $conn -X -A -v ON_ERROR_STOP=1 -o "$dir\cantina-$data-contagem.txt" -c "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY" -c "<consulta de contagem>"
& "$pg\pg_dump.exe" -d $conn --schema=public --format=custom --no-owner --file "$dir\cantina-$data.dump"
& "$pg\pg_restore.exe" --list "$dir\cantina-$data.dump" | Select-String 'TABLE DATA'
Remove-Item Env:PGPASSWORD
```

- A consulta de contagem tem uma linha por tabela, com `count(*)` e a soma dos valores.
- O host e o usuário são os do projeto **em uso**. A ref no `user=` precisa ser a de produção.
- Acrescentar `*.dump` e `*-contagem.txt` ao `.gitignore`.

## Decisões pendentes

1. ~~Remover `fiadores.status`, `fiadores.telefone` e `compras.fechado`?~~ **Decidido em 14/10: nenhuma coluna é apagada por enquanto.** O fechamento novo não lê nenhuma delas.
2. **Segurança, a resolver por último** (depois que todos os testes passarem, como primeiro passo da etapa 4): o login está desligado e o Vite escuta em todas as interfaces (`host: "::"`). Qualquer aparelho na mesma rede entra como admin, e a senha do admin vai no JS servido.
3. **Pasta de desenvolvimento separada** (`git worktree`): só importa depois da entrada em uso, quando o HMR passa a levar edições direto ao caixa.

## Fora do escopo

- Cobrança via WhatsApp, cópia de extrato e dashboard de inadimplência. A aba Fechamento já reserva os espaços (ver "Front").
- **`mes_referencia` em UTC**, no front: fica como está. Nada no fechamento novo depende dele.
