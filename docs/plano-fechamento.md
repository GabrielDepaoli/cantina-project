# Plano — Área de Fechamento de Contas (v5)

> v5 acrescenta cinco ajustes à v4:
> - etapa 3 quebrada em sub-etapas;
> - trava e aviso no rollback da etapa 2;
> - procedimento para tratar divergências;
> - higiene dos dados reais em staging;
> - bloqueio de uma segunda troca de dia enquanto houver transição aberta.

> v4: incorpora seis correções sobre a v3.
> 1. Backup com restauração testada.
> 2. Pós-condição do `registrar_pagamento` restrita ao ramo de saldo ≤ 0.
> 3. Conferência avulsa de integridade.
> 4. Registro detalhado das divergências aceitas.
> 5. Custo do lock de fechamento.
> 6. O que fica fora do escopo e onde já fica reservado na aba.

> Plano só de desenho. Nada é implementado até o usuário pedir.

## Contexto

Hoje o fechamento é a RPC `fechar_mes(p_mes_referencia)`, chamada pelo botão "Fechar Mês Atual" na aba Relatórios. Ela agrupa por mês-calendário (texto `YYYY-MM`). O `total` é a soma das compras do mês. O `valor_pago` casa os pagamentos pela **data** dentro do mês, e é por isso que aparece "Pago: R$ 0" quando alguém paga em outubro a dívida de setembro. A RPC também filtra pelo campo legado `status = 'ativo'`.

O objetivo é trocar isso por fechamentos de **período com datas reais**:
- o período segue um dia-âncora configurável;
- o fechamento é manual, um período por clique, sempre do mais antigo pendente;
- o saldo de cada ficha é **reconstruído pelo razão** até a data de corte;
- o item fica em aberto até o saldo da ficha chegar a ≤ 0, e o atraso (1, 2, 3+) aparece na UI.

Junto com isso, o plano converte as RPCs para SECURITY DEFINER e, por último, endurece a RLS, com rollback pronto.

Arquivos lidos: `supabase/setup-completo.sql`, as 5 migrations, `src/pages/Index.tsx`, `src/components/FichaDetalheDialog.tsx`, `src/components/NovaVendaDialog.tsx`, `src/lib/saldo.ts` e os hooks `src/hooks/useFichas.ts`, `usePagamentos.ts`, `useFechamentos.ts`, `useVendas.ts` e `useFaturamento.ts`.

## Regras consolidadas (decididas)

1. **Conta corrente.** Pagamento não se vincula a compra nem a fechamento.
2. **Período.**
   - A âncora é o dia N. O período vai do dia N até a véspera do dia N do mês seguinte.
   - Em mês curto, se o dia N não existir, usa o último dia do mês, sem deslocar a âncora dos meses seguintes (com N=31: 31/01–27/02, 28/02–30/03, 31/03–29/04).
   - O período é guardado como `date`. `mes_referencia` vira só rótulo.
3. **Invariante de encadeamento.** O `data_inicio` de um período é sempre o `data_fim` do anterior + 1 dia. Nunca existe buraco nem sobreposição. Isso é imposto no banco (ver b).
4. **Disparo manual, um período por clique, sempre o mais antigo pendente.**
   - Só fecha período que já terminou (`data_fim < hoje`, no fuso America/Sao_Paulo).
   - Nunca fecha período anterior ao que contém a primeira compra do sistema.
   - A UI mostra qual período será fechado e quantos ficam pendentes. Quando não há o que fechar, o botão fica desabilitado, com um tooltip explicando o motivo.
5. **Saldo congelado** = razão até o corte.
   - O corte de um período é `(data_fim + 1)` às 00:00 em São Paulo.
   - Só gera item quando o saldo no corte é > 0.
   - O valor congelado é histórico e nunca é recalculado.
6. **Quitação.**
   - Na criação do item: percorre o razão a partir do corte e procura o primeiro instante em que o saldo ficou ≤ 0. Se esse instante existe, o item já nasce quitado com aquela data; se não, nasce em aberto.
   - Depois de criado: `registrar_pagamento` quita atomicamente todos os itens abertos da ficha quando o `saldo_atual` chega a ≤ 0.
   - Não existe quitação parcial.
7. **Atraso** = quantos fechamentos se passaram desde o item aberto mais antigo, contando o período desse item.
   - 1 = amarelo, 2 = laranja, 3 ou mais = vermelho.
   - Pular vários níveis de uma vez é o comportamento correto.
   - O rótulo **sempre traz o número em texto**, para não depender só da cor.
   - Atraso **nunca bloqueia venda**. Só `bloqueada` bloqueia.
8. **Listas mostram o `saldo_atual` ao vivo** (`formatSaldo`). O valor congelado aparece só no histórico.
9. **Divergência entre razão e saldo.**
   - Em todo fechamento, compara o razão completo até agora com o `saldo_atual`, ficha a ficha.
   - Se divergir, a RPC recusa. A UI lista as fichas divergentes e pede confirmação explícita.
   - A confirmação fica registrada em `periodo_divergencias`: quais fichas e com que valores.
   - A checagem também pode ser rodada **avulsa**, sem fechar período, pela tela de Configurações. Nessa tela ela só exibe e nunca corrige nada.
10. **Legado (`fechamentos`).**
    - A tabela fica intacta e só de leitura.
    - A quitação é inferida pelo razão, numa view, sem gravar nada.
    - O legado não conta no atraso.
11. **Excluir ficha.**
    - Fica bloqueado enquanto houver item em aberto.
    - Fora isso, o histórico é mantido com número e nome congelados no item.
12. **Troca do dia-âncora.**
    - **Bloqueada enquanto houver período encerrado pendente de fechamento.** O bloqueio é imposto no banco e na UI.
      - A tela explica o que fazer: quantos períodos estão pendentes, quais são (com as datas) e que é preciso fechá-los antes. Traz também um link direto para a aba Fechamento.
    - Sem pendentes, a troca gera um período de **transição**.
      - Ele vai do dia seguinte ao `data_fim` do último período fechado até a véspera da primeira ocorrência do novo dia a partir dessa data. Por isso nunca passa de ~31 dias.
      - Se o dia seguinte já for uma ocorrência do novo dia, não há transição.
      - Se nenhum período foi fechado ainda, a troca só recalcula a cadeia a partir da primeira compra, sem transição.
    - O período de transição fica gravado com marcação própria e aparece rotulado na UI.
    - A troca não mexe em período já fechado, nem recalcula valor congelado, nem altera item quitado.
    - Antes de salvar, a tela mostra em texto o período de transição, com início, fim e número de dias, e pede confirmação.
    - Aviso extra **só para transição com menos de 7 dias**. O aviso de mais de 60 dias saiu, porque deixou de ser possível.
    - Toda troca entra no histórico de auditoria: data, valor antigo, valor novo e usuário.
    - **A invariante da regra 3 vale atravessando a transição.**
    - **Uma segunda troca fica bloqueada enquanto a transição da troca anterior não for fechada** (ajuste 5 da v5).
      - "Transição aberta" quer dizer que a última linha de `configuracao_historico` gerou uma transição (`transicao_inicio` não nulo) e ainda não existe período fechado com esse `data_inicio`.
      - O bloqueio é imposto no banco, em `definir_dia_fechamento`, e na tela, no mesmo padrão do bloqueio por pendência. A mensagem diz: "A troca anterior (dia X → Y) gerou a transição DD/MM–DD/MM, que ainda não foi fechada. Feche-a quando terminar (a partir de DD/MM) e então troque o dia."
      - Com isso, `configuracao_historico` nunca registra uma transição que deixou de existir.
13. **Atraso aparece** na lista de Fichas, no detalhe da ficha e na etapa 2 da Nova Venda.
    - **Não** aparece na busca da etapa 1.
    - Não pode competir com o badge Ativo/Bloqueada (ver e).

---

## a) O que atrapalha no schema atual

- **`fechamentos`:** é por mês-calendário e não tem datas. O `total` é a soma das compras do mês, não o saldo no corte. O `valor_pago` casa por mês. Não há estado de quitação. O campo `data_pagamento`, na prática, é o timestamp do fechamento. **Vira legado só de leitura.**
- **`UNIQUE(fiador_id, mes_referencia)`:** não representa um período de N a N-1. Continua valendo só dentro do legado.
- **`compras.mes_referencia` e `compras.fechado`:** saem do processo de fechamento e viram rótulo/legado. O único lugar que escreve `fechado` é `fechar_mes`, que morre.
- **`status` e o filtro `WHERE status='ativo'`:** o fechamento novo não lê `status`. Toda ficha devedora no corte entra, inclusive bloqueadas e fichas `inativo` antigas.
- **Fuso:** hoje o front usa `toISOString()`, que é UTC. O período passa a ser calculado no banco, em America/Sao_Paulo.
- **RPCs:** as três atuais são **SECURITY INVOKER**. Nenhuma tem cláusula `SECURITY`, e invoker é o padrão. Isso impede a quitação sem uma policy de UPDATE e impede o endurecimento (ver g e i).
- **O razão vira a fonte da verdade.** Daí os caminhos que escrevem fora das RPCs, inclusive INSERT direto, precisam ser fechados no fim (ver i).

## b) Schema proposto

A mudança vai numa migration nova da etapa 2, com `setup-completo.sql` e `types.ts` sincronizados.

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

-- Correção 4: divergências aceitas ficam registradas uma a uma, com os valores
CREATE TABLE public.periodo_divergencias (
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

**Por que uma tabela filha e não um `boolean` ou um `jsonb`.** O `boolean` dizia só que houve aceitação, e não *o que* foi aceito. O `jsonb` guardaria a informação, mas sem tipo nem constraint: daria para gravar valor como texto, ficha repetida ou um "divergente" com valores iguais. A tabela filha tem colunas tipadas, constraints e pode ser consultada com JOIN. "Houve divergência aceita" vira simplesmente "existem linhas para este período". A diferença é `saldo_atual − saldo_razao`, calculada na leitura e nunca guardada.

**Por que cada constraint existe:**

1. Garante uma única linha de configuração.
2. Aceita 1–31. Os dias que não existem no mês são tratados pela regra do último dia.
3. `UNIQUE(periodo_anterior_id)`: cada período tem no máximo um sucessor. Junto com (7), isso transforma os períodos numa **cadeia linear**, sem bifurcação.
4. Impede datas invertidas.
5. **Clique duplo.**
   - O segundo `INSERT` do mesmo período espera na unique index até o primeiro commitar e então falha com o erro 23505.
   - A RPC transforma esse erro em "Período já fechado".
   - Funciona até entre computadores diferentes.
   - Também falha se dois cliques tentarem pendurar sucessores no mesmo anterior, por (3).
6. Defesa extra contra sobreposição, caso o trigger tenha algum bug. É nativo do Postgres, sem extensão.
7. Só um período pode ser a raiz da cadeia (sem anterior).
8. **Invariante de encadeamento** (regra 3) no banco. Não basta confiar na RPC.
9. Período com itens nunca pode ser apagado.
10. Implementa a regra 11. Número e nome ficam congelados no item.
11. Implementa a regra 5 no banco: só existe item com saldo devedor.
12. Auditoria: guarda qual pagamento quitou o item, tanto na quitação inferida quanto na feita ao vivo.
13. Uma ficha por período. É a garantia equivalente à de hoje.
14. Deixa rápidas a quitação e o cálculo de atraso.
15. Deixa rápida a reconstrução do razão por ficha e data. `pagamentos` já tem o índice `(fiador_id, data)`.
16. Implementa a regra 11 no banco, sem depender do front.
17. O registro de divergência aceita nunca pode ser apagado junto com o período, nem antes dele.
18. Impede gravar uma "divergência" que não diverge.
19. Uma linha por ficha e período.

**Views** (com `security_invoker = true`, para respeitar a RLS):

- `v_atraso_fichas`: `fiador_id`, `desde` e `atraso`. O atraso é a contagem de períodos com `data_inicio` maior ou igual ao do item aberto mais antigo. Contar períodos em vez de itens mantém o número correto mesmo se o razão tiver alguma anomalia.
- `v_fechamentos_legado`: cada linha antiga com o corte `(mes_referencia||'-01')::date + 1 mês` em São Paulo. Mostra "quitado no próprio mês", "quitado em DD/MM/AAAA" ou "em aberto", calculado pelo mesmo algoritmo de varrer o razão.

## c) Migração do histórico e do campo `status`

- **`fechamentos` não é alterada.** Na etapa 4 saem `fechar_mes` e a policy de INSERT dessa tabela.
- **`status`:** depois da etapa 4, nada mais lê esse campo. A coluna fica. `DROP` dela e de `telefone` só numa limpeza futura, com aprovação sua.
- **Etapa 0, pré-checagem (só leitura):** contagem do legado, fichas `inativo`, primeira compra, **divergência razão × saldo**, snapshot de policies, grants e `prosecdef`, e o estado do signup. Tudo no apêndice.

## d) RPCs

Todas as RPCs de escrita seguem o mesmo padrão:
- `SECURITY DEFINER`;
- `SET search_path = public, pg_temp`;
- `REVOKE EXECUTE … FROM PUBLIC, anon`;
- `GRANT EXECUTE … TO authenticated`;
- **depois de todo UPDATE que precisa atingir uma linha, `GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE`** (regra das zero linhas).

**Etapa 1 — conversão isolada, sem lógica de fechamento:**

- `registrar_compra` e `registrar_pagamento` passam a ser DEFINER, com o REVOKE do `anon`.
- A ordem interna muda: primeiro `UPDATE fiadores … RETURNING saldo_atual`, que trava a ficha; depois o `INSERT` no razão.
- Entra a checagem de `ROW_COUNT = 1`.
- As assinaturas e os retornos não mudam, então o front não muda.

**Etapa 2 — fechamento:**

- **`periodo_de(p_data date, p_dia smallint)`** (IMMUTABLE)
  - Âncora do mês: `make_date(ano, mes, least(p_dia, último dia do mês))`.
  - Retorna o período regular que contém `p_data`.
- **`proximos_periodos()`** (STABLE)
  - Calcula a lista de pendentes a partir do último período fechado, ou a partir de `periodo_de(primeira compra)` se ainda não houver nenhum.
  - Se o próximo início não cai na âncora atual, o próximo período é de **transição**.
  - Vai gerando períodos enquanto `data_fim < hoje` (em SP).
  - Retorna `data_inicio`, `data_fim`, `transicao` e `ordem`.
  - Se a lista vier vazia, o front monta o texto do tooltip a partir do próximo período.
- **`verificar_divergencias()`** (STABLE, só leitura)
  - Retorna `fiador_id`, `numero_ficha`, `nome_aluno`, `saldo_atual` e `saldo_razao` das fichas em que os dois valores diferem.
  - Tem dois usos, e é a mesma função nos dois: dentro do `fechar_periodo` e na **conferência avulsa** da tela de Configurações (correção 3).
  - Não escreve nada.
- **`fechar_periodo(p_data_inicio date, p_divergencias_confirmadas jsonb DEFAULT '[]')`**
  - O parâmetro booleano da v3 é substituído pela lista que o operador viu e confirmou na tela: `[{fiador_id, saldo_atual, saldo_razao}, …]`.
  1. Trava a linha de `configuracao` com `FOR UPDATE`.
  2. Trava todas as fichas com `PERFORM 1 FROM fiadores ORDER BY id FOR UPDATE`. A ordem fixa evita deadlock. Como compra e pagamento travam a ficha antes de gravar no razão, nada entra no razão durante o fechamento.
  3. Confere se `p_data_inicio` é o primeiro de `proximos_periodos()`. Se não for, levanta erro.
  4. Recalcula `verificar_divergencias()` **já com as fichas travadas** e compara com `p_divergencias_confirmadas`:
     - **Não há divergência:** segue.
     - **Há divergência e o conjunto é idêntico** ao confirmado (mesmas fichas, mesmos valores): segue.
     - **Há divergência e o conjunto é diferente** (inclusive vazio contra não vazio): levanta um erro com código próprio e devolve a lista atual. O front mostra a lista nova e pede confirmação de novo.
     - Assim fica registrado exatamente o que o operador viu, e não uma divergência que apareceu entre a tela e o clique.
  5. Insere em `periodos_fechamento`, com o anterior, o `dia_ancora` vigente e a marcação de transição. Erro 23505 ou 23P01 vira "Período já fechado".
  5b. Se houve divergência aceita, insere as linhas em `periodo_divergencias`, com número e nome congelados.
  6. Monta os itens com CTEs:
     - `saldos` = razão com `data < corte`, só os maiores que zero;
     - `eventos` = compras (+) e pagamentos (−) com `data >= corte`;
     - saldo acumulado com uma função de janela, ordenada por data, depois tipo (compra antes de pagamento no mesmo instante), depois id;
     - o primeiro evento com saldo acumulado ≤ 0 é sempre um pagamento; dele saem `quitado_em` e `quitado_por_pagamento_id`;
     - `INSERT fechamento_itens` com número e nome congelados.
  7. Retorna o período criado.

  **Custo do lock (correção 5)**

  - **Volume real conhecido.** Na última leitura do app (18/08) havia 9 fichas (#001 a #009) e algumas dezenas de compras. O número da ficha tem 3 dígitos, então o teto absoluto é 999 fichas. O volume atual tem que ser medido na etapa 0, com `SELECT count(*)` em `fiadores`, `compras` e `pagamentos`.
  - **O que roda com o lock aberto:**
    - trava até 999 linhas de `fiadores`;
    - duas agregações por ficha sobre `compras` e `pagamentos`, que ganham índice `(fiador_id, data)`;
    - uma janela sobre os lançamentos posteriores ao corte;
    - até 999 INSERTs de item.
  - **Estimativa:**
    - Hoje (10–20 fichas, centenas de lançamentos): **dezenas de milissegundos** dentro do banco. O ida e volta de rede, de 100 a 300 ms, é maior que o próprio fechamento.
    - Pior caso plausível (999 fichas, ~50 mil lançamentos acumulados): **centenas de milissegundos**, ainda abaixo de 1 segundo.

    Isso é estimativa, não medição: a etapa 2 inclui a medição em staging (ver Verificação).
  - **O que acontece com uma venda disparada durante o fechamento.**
    - O `UPDATE fiadores` do `registrar_compra` **espera** o lock ser liberado. Não falha.
    - Quando o fechamento faz commit, a venda segue normalmente e o operador só vê o "Registrando..." por uma fração de segundo a mais.
    - Ela só falharia se a espera passasse do `statement_timeout` do papel `authenticated` no Supabase, que é de **8 s** por padrão. Nesse caso o operador veria o toast "Erro ao registrar venda" e poderia repetir.
    - A venda não fica pela metade: a RPC é uma transação só, e a ordem nova (trava antes de inserir) garante que nada é gravado sem o saldo.
  - **Proteções:**
    - `fechar_periodo` define `SET LOCAL lock_timeout = '3s'`. Se não conseguir as travas em 3 s (alguma venda presa, por exemplo), ele **desiste** com a mensagem "Há operações em andamento; tente de novo em instantes" em vez de segurar o caixa.
    - O diálogo de confirmação **sempre** mostra a linha "Durante o fechamento, vendas e pagamentos ficam aguardando por um instante. Prefira fechar fora do horário de movimento."
    - Se a medição em staging com volume máximo passar de **2 s**, a linha vira um aviso destacado, em âmbar, e a recomendação passa a ser obrigatória no texto.
  - **Sem deadlock.**
    - `registrar_*` trava uma única ficha e depois só toca em itens dessa ficha.
    - `fechar_periodo` trava a configuração e depois todas as fichas, sempre em ordem de `id`.
    - Nenhum dos dois espera por um recurso que o outro segure em ordem invertida.
- **`registrar_pagamento`** (ganha a quitação). Correção 2: a pós-condição existe **só dentro do ramo de saldo ≤ 0**.

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
  -- saldo > 0 (pagamento parcial): não toca nos itens e não verifica nada.
  -- O item continua aberto de propósito (regra 6).
  RETURN v_pag;
  ```

  - O `UPDATE` de quitação pode afetar zero linhas legitimamente (ficha sem itens), por isso não usa checagem de `ROW_COUNT`. A garantia vem da pós-condição, que só faz sentido quando o saldo zerou.
- **`simular_troca_dia(p_dia smallint)`** (STABLE)
  - Retorna:
    - `bloqueado`, a lista de pendentes com datas e a contagem;
    - `transicao_inicio`, `transicao_fim` e `dias`;
    - `sem_transicao`;
    - `aviso_curta` (menos de 7 dias).
  - A tela de Configurações mostra esse resultado em texto antes de salvar.
- **`definir_dia_fechamento(p_dia smallint, p_confirmar_aviso boolean DEFAULT false)`**
  1. Trava a linha de `configuracao`.
  2. Se `proximos_periodos()` não vier vazio, levanta erro "Há N período(s) pendente(s): …".
  2b. Se houver transição aberta (ver regra 12), levanta erro com a mensagem da transição pendente.
  3. Recalcula a simulação. Se houver aviso de transição curta e o parâmetro de confirmação não vier verdadeiro, levanta erro.
  4. Faz o `UPDATE configuracao` e exige `ROW_COUNT = 1`.
  5. Grava em `configuracao_historico`.
  - A transição não é gravada nessa hora. Ela vira período quando for fechada, em `fechar_periodo`, que a marca com `transicao = true`.
- **`fechar_mes`:** morre na etapa 4.

## e) Front

**Aba "Fechamento"**, que absorve a seção de Relatórios:

- **Sai de `src/pages/Index.tsx`:** a seção "Fechamento Mensal", o `useFecharMes` e o `mesAtualRef` em UTC. A aba Relatórios fica só com os cards.
- **Cabeçalho:**
  - "Próximo a fechar: DD/MM–DD/MM", com o selo **"transição"** quando for o caso, e "· N pendente(s)".
  - Botão "Fechar período…". Abre uma confirmação que mostra:
    - o número de fichas e o total que será congelado;
    - a lista de divergências, se houver, com saldo atual e saldo pelo razão lado a lado;
    - a linha sobre vendas aguardando durante o fechamento (correção 5).
  - O botão fica desabilitado, com tooltip, quando não há nada a fechar e enquanto `isPending`.
- **Em aberto:** cada ficha com o saldo **ao vivo** e o rótulo de atraso.
- **Histórico:** períodos expansíveis, com o selo de transição quando for o caso. Cada ficha mostra o valor "no fechamento" e o estado "quitado em DD/MM/AAAA" ou "em aberto".
- **Fechamentos antigos:** os dados de `v_fechamentos_legado`.
- **Badge de pendência** na aba da navegação.
- **Espaços já reservados para o que fica fora deste plano** (correção 6). A ideia é que esses recursos entrem depois sem refazer a tela:
  - **Ações por ficha:** cada linha de "Em aberto" é um componente `LinhaFichaEmAberto` com uma área de ações à direita (`acoes?: ReactNode`). Os botões futuros "Cobrar via WhatsApp" e "Copiar extrato" entram ali. Hoje a área fica vazia, sem botão de mentira.
  - **Ações no topo da aba:** o cabeçalho tem uma área à direita (`extrasCabecalho?: ReactNode`) para ações em lote no futuro, como cobrar todos os atrasados.
  - **Indicadores:** um espaço entre o cabeçalho e as listas (`indicadores?: ReactNode`) para os cards do dashboard de inadimplência no futuro. Hoje não é renderizado.
  - **Dados:** `useAtrasos` e `usePeriodos` já devolvem o que esses recursos vão precisar (ficha, telefone do responsável, saldo ao vivo, atraso, períodos em aberto), então não será preciso outra query.

**Tela nova "Configurações"**

- Novo valor `configuracoes` no state `view`, aberto por um ícone de engrenagem no header, fora da nav principal. Pode reunir outras configurações no futuro, como `cantinaConfig`.
- **Campo do dia-âncora (1–31):**
  - Fica **desabilitado** se houver período pendente.
  - Nesse caso mostra: "Há N período(s) encerrado(s) sem fechamento (DD/MM–DD/MM, …). Feche-os antes de trocar o dia." e um link **"Ir para Fechamento"**, que troca o `view`.
- **Antes de salvar:** mostra a simulação em texto, "Transição de DD/MM a DD/MM (X dias)" ou "Sem transição", e pede confirmação. Uma transição com menos de 7 dias pede uma confirmação extra, com aviso.
- **Histórico de trocas:** data, dia anterior, dia novo e o período de transição gerado.
- **Seção "Integridade do razão"** (correção 3). Fica abaixo do dia-âncora, na mesma tela.
  - Botão **"Conferir agora"**, que chama `verificar_divergencias()`. É só leitura e não fecha período.
  - **Sem divergência:** "Nenhuma divergência — razão e saldo batem em todas as N fichas. Conferido às HH:MM."
  - **Com divergência:** uma tabela com uma linha por ficha.

    | Ficha | Nome | Saldo no banco | Saldo pelo razão | Diferença |
    |---|---|---|---|---|

    - As duas colunas de saldo usam `formatSaldo`, para seguir a convenção de sinal da tela.
    - A diferença é mostrada em valor bruto, com sinal.
  - **Não há nenhum botão de corrigir.** O texto fixo diz que a correção é manual, via SQL no Supabase, depois de um backup.
  - **Histórico:** mostra também os períodos fechados com divergência aceita, a partir de `periodo_divergencias`, com as fichas e os valores daquele momento.

**Badge de estado da conta (centralizado antes de mudar)**

Hoje o badge está duplicado em três lugares, sem componente:

- `src/pages/Index.tsx:664-665`, na lista de Fichas: pill suave, verde ou vermelho.
- `src/components/FichaDetalheDialog.tsx:201-203`, no título do detalhe: pill suave, verde ou vermelho.
- `src/components/NovaVendaDialog.tsx:150`, no seletor da etapa 1: pill **âmbar** "Bloqueada".

O plano:

1. Criar `src/components/EstadoContaBadge.tsx` e trocar os três lugares por ele, ainda com o visual atual. Verificar que nada mudou.
2. Só depois mudar o visual para **sólido**, de uma vez, nos três: fundo cheio e texto branco, verde "Ativo" e vermelho "Bloqueada". No seletor da Nova Venda, o âmbar vira vermelho sólido, igual ao resto.

O card de "Conta bloqueada" da etapa 2 não é badge e continua como está.

**Rótulo de atraso**

- Componente `src/components/AtrasoChip.tsx`, mais um helper `classeLinhaAtraso(nivel)` para a faixa e o fundo da linha.
- A **forma** é o que distingue as duas coisas, e não a cor:
  - **badge sólido** = estado da conta;
  - **faixa lateral de 4px + fundo bem suave na linha** = atraso;
  - **chip com relógio e o texto "N período(s) em atraso"**, sempre com o número escrito.
- Contraste: só existe o modo claro (não há `ThemeProvider` nem classe `dark` aplicada). O fundo da linha fica em ~5% de opacidade, para não atrapalhar a leitura do nome e do saldo. Verificar com DevTools (contraste AA) o nome, o saldo e o chip, nos três níveis.
- O **atraso** usa outra forma:
  - um chip com ícone de relógio e o **texto "N período(s) em atraso"**;
  - na lista de Fichas, também uma **faixa lateral de 4px** e um fundo bem suave na linha, na cor do nível.
- Os tokens das cores ficam na pergunta 2. O laranja do app já é o `primary`, e o amarelo `warning` já é usado pela anotação.

Pior caso na lista (ficha bloqueada e com 3 períodos em atraso):

```
▌ #003  Morel                                    -R$ 125.00
▌       ⏱ 3 períodos em atraso                 [█ Bloqueada █]
```

- **Detalhe da ficha:** o chip de atraso aparece no título, ao lado do badge sólido.
- **Nova Venda, etapa 2:**
  - o chip de atraso fica numa linha própria, logo acima da anotação;
  - a anotação continua como linha de texto com o ícone 🗒;
  - formas diferentes, chip contra texto, e ícones diferentes, relógio contra nota, separam os dois mesmo quando ambos são amarelos;
  - o atraso não muda a borda do card nem bloqueia nada.
- **Nova Venda, etapa 1:** sem atraso.

**Hooks:**

- `src/hooks/useFechamentos.ts` é reescrito com `useProximosPeriodos`, `useDivergencias`, `useFecharPeriodo`, `usePeriodos`, `useAtrasos` (um `Map` por ficha), `useFechamentosLegado`, `useConfiguracao`, `useSimularTrocaDia` e `useDefinirDia`.
- `useRegistrarPagamento` passa a invalidar também `fechamentos` e `atrasos`.

**Escrita sem falha silenciosa:**

- `useDeleteFicha` (`src/hooks/useFichas.ts:72`) hoje faz `.delete().eq()` **sem** `.select()`. Se a RLS barrar, ele volta zero linhas sem erro. Passa a ser `.delete().eq().select()`, e se o tamanho da resposta for diferente de 1, lança erro.
- O erro do trigger da regra 11 vira a mensagem "A ficha tem fechamento em aberto; quite antes de excluir". O texto de confirmação de "Excluir Ficha" no `FichaDetalheDialog` é atualizado.

**Reaproveitado:** `formatSaldo` (`src/lib/saldo.ts`), o padrão de junção por `Map` usado em `useVendas`, e os dialogs de confirmação do `FichaDetalheDialog`.

## g) SECURITY e RLS

- **Hoje as RPCs são SECURITY INVOKER.** Por isso:
  - Uma quitação dentro de uma RPC invoker, sem policy de UPDATE, afetaria zero linhas sem dar erro.
  - Revogar policies **quebraria as próprias RPCs**. A conversão para DEFINER precisa vir antes, em uma etapa própria e verificada: a etapa 1.
- **Com DEFINER:**
  - As tabelas novas ficam só com policy de SELECT para `authenticated`, sem nenhuma policy de escrita. Uma policy de UPDATE permitiria a qualquer `authenticated` forjar ou reabrir quitações direto pela API.
  - O `REVOKE EXECUTE … FROM PUBLIC, anon` é obrigatório. O Postgres concede EXECUTE a `PUBLIC` por padrão, e o repositório nunca revogou isso. Com DEFINER, o `anon`, que tem só a chave pública que está no repo, conseguiria escrever.
  - A função DEFINER roda como dona das tabelas (`postgres`), que não passa pela RLS sem `FORCE`. O `search_path` fixo impede sequestro de função.
- ⚠️ Confirmar na etapa 0 que o *Allow new users to sign up* está desligado.

## h) Fechamento duplicado no schema novo

A garantia é composta por:

- `UNIQUE(data_inicio)`;
- `UNIQUE(periodo_anterior_id)`;
- a raiz única;
- o `EXCLUDE` de sobreposição;
- o trigger de encadeamento;
- o `UNIQUE(periodo_id, fiador_id)`;
- a trava na linha de `configuracao`;
- a exigência de que o período seja "o primeiro pendente";
- o botão desabilitado durante o `isPending`.

O `UNIQUE(fiador_id, mes_referencia)` continua valendo só no legado.

## i) Endurecimento — ÚLTIMA etapa (5), com rollback

### Inventório de todos os caminhos de escrita

| # | Onde | O que faz | Destino |
|---|---|---|---|
| 1 | `src/hooks/useFichas.ts:52-53` (`useUpdateFicha`), chamado em `FichaDetalheDialog.tsx:85` (nomes, celulares, CPFs, responsável 2), `:110` (`bloqueada`), `:125` (`somente_credito`) e `:145` (`observacoes`) | UPDATE direto em `fiadores` | **Exceção:** continua como UPDATE direto, mas com `GRANT UPDATE` **por coluna**, só nessas 10 colunas. O tipo TS do hook passa a ser um `Pick<>` dessas colunas. Hoje ele já usa `.select().single()`, então zero linhas viram erro PGRST116 (falha visível). |
| 2 | `src/hooks/useFichas.ts:72` (`useDeleteFicha`), chamado em `FichaDetalheDialog.tsx:160` | DELETE em `fiadores`. Por cascata de FK, apaga também `compras`, `pagamentos` e `fechamentos` da ficha | **Exceção:** continua, com o trigger da regra 11 e a checagem de linhas afetadas (ver e). As cascatas de FK não passam pela RLS. **Verificar em staging** que a exclusão continua funcionando depois do endurecimento. |
| 3 | `src/hooks/useFichas.ts:32-33` (`useCreateFicha`), chamado em `Index.tsx:220` | INSERT em `fiadores`. Hoje o tipo permite mandar `saldo_atual` | **Exceção:** INSERT direto com `GRANT INSERT` **por coluna**, sem `saldo_atual` nem `status`. Hoje já usa `.select().single()`. |
| 4 | `registrar_compra`: migration `20260811190000:31` e `setup-completo.sql:104` | UPDATE no saldo de `fiadores` | **RPC DEFINER** (etapa 1). |
| 5 | `registrar_pagamento`: migration `20260812000000:38` e `setup-completo.sql:150` | UPDATE no saldo de `fiadores` | **RPC DEFINER** (etapa 1). |
| 6 | `fechar_mes`: migration `20260812000000:88` e `setup-completo.sql:193` | UPDATE em `compras SET fechado = true` | **Morre** na etapa 4, antes do endurecimento. |
| 7 | Trigger `update_fiadores_updated_at` (migration inicial `:58-68`) | Altera `NEW.updated_at` | **Fica.** Não é um UPDATE separado, e privilégio por coluna só vale para as colunas do `SET`. **Verificar em staging.** |
| 8 | Policies "update compras" (migration inicial `:52`) e "delete compras" (`20260812190000:5`) | Liberam UPDATE e DELETE direto em compras | **Morrem.** Nenhum código usa. |
| 9 | Policies "insert compras" (inicial `:51`) e "insert pagamentos" (`20260812000000:16`) | INSERT direto no razão, **sem ajustar o saldo** | **Morrem.** Depois da etapa 1, só as RPCs DEFINER inserem. Decidido: revogar. O rollback restaura essas policies. |
| 10 | Policy "insert fechamentos" (inicial `:55`) | Usada só por `fechar_mes` | **Morre** na etapa 4. |
| 11 | RPCs novas da etapa 2 | Escrevem nas tabelas novas | Já nascem DEFINER, e as tabelas não têm policy de escrita. |

**Auditoria de INSERT direto em `compras` e `pagamentos`**

A varredura cobriu o repositório inteiro, menos `node_modules`.

- **Front (`src/`):** zero. Todos os `.from("compras")` e `.from("pagamentos")` são SELECT: `useVendas.ts:9`, `useFaturamento.ts:14` e `usePagamentos.ts:46-47`.
- **SQL:** só dentro das RPCs.
  - `INSERT INTO compras` em `registrar_compra`: migration `20260811190000:27` e `setup-completo.sql:100`.
  - `INSERT INTO pagamentos` em `registrar_pagamento`: migration `20260812000000:34` e `setup-completo.sql:146`.
- **Seeds, scripts e utilitários:** não existem no repositório. Não há `seed*`, nem pasta `scripts/`, nem `.mjs`/`.cjs` próprios.

Conclusão: depois da etapa 1, as duas RPCs DEFINER são os únicos escritores do razão. Nenhum caminho fica órfão.

**SQL Editor e dados de teste depois da etapa 5**

- O SQL Editor do Supabase roda, por padrão, como **`postgres`**, que é o dono das tabelas.
- O dono não passa pela RLS (não há `FORCE ROW LEVEL SECURITY`), e os REVOKEs só atingem `authenticated` e `anon`. Ou seja, **a etapa 5 não afeta o SQL Editor**.
- O seletor de role do editor, que permite rodar como `authenticated` ou `anon`, é justamente o jeito de testar o endurecimento.
- Como continuar criando e limpando dados de teste:
  - **Criar a ficha:** `INSERT INTO fiadores (numero_ficha, nome_aluno, nome_responsavel, tipo) VALUES ('997', …)` no SQL Editor, ou pela própria tela.
  - **Lançar compras e pagamentos:** sempre via RPC, nunca com `INSERT` direto, para o razão continuar igual ao saldo:
    ```sql
    SELECT registrar_compra('<id>', 'Teste', 10, to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM'));
    SELECT registrar_pagamento('<id>', 10, 'Teste');
    ```
    Um `INSERT` direto feito como `postgres` continua *possível*, mas gera divergência entre razão e saldo, e o próximo fechamento vai pedir confirmação.
  - **Limpar:** `DELETE FROM fiadores WHERE numero_ficha IN ('997','998','999');`. A cascata apaga compras e pagamentos. O trigger da regra 11 só bloqueia se a ficha de teste tiver item aberto, o que não acontece se ela for criada e apagada **dentro do mesmo período**.

**Guarda na própria migration de endurecimento**

O primeiro comando da migration de endurecimento é um bloco `DO`. Ele aborta tudo, sem revogar nada, se `registrar_compra` ou `registrar_pagamento` não tiverem `prosecdef = true`, que é o que indica SECURITY DEFINER.

### Migrations da etapa 5

- **`…_endurecimento.sql`:**
  - `DROP POLICY` dos itens 8 e 9;
  - `REVOKE INSERT, UPDATE ON fiadores FROM authenticated` + `GRANT INSERT (…), UPDATE (…)` por coluna;
  - `REVOKE EXECUTE … FROM PUBLIC, anon` nas RPCs.
- **`…_endurecimento_ROLLBACK.sql`:** recria **exatamente** o estado registrado no snapshot da etapa 0.
  - As policies, com o mesmo nome e o mesmo texto.
  - Os grants de tabela, que no Supabase normalmente são `ALL` para `anon`, `authenticated` e `service_role`. O texto exato sai do snapshot, não de memória.
  - O rollback roda em segundos e não mexe em dados.

## Ambientes: staging, seed e galeria

**Regra (vai para o CLAUDE.md na implementação):** fechamento, dashboard e endurecimento de RLS se testam **em staging, nunca em produção**. As fichas 997–999 continuam valendo só para alterações pontuais em produção. Elas não servem para fechamento, porque o fechamento varre todas as fichas devedoras.

### Staging: passo a passo (feito por você)

1. **Criar o projeto.** No painel do Supabase, *New project* com o nome `cantina-staging`, na mesma região. Guarde a senha do banco no seu gerenciador de senhas, nunca no repositório.
2. **Montar o banco.**
   - Rode `supabase/setup-completo.sql` no SQL Editor, já atualizado com as etapas 1 e 2.
   - Rode `supabase/staging/00-marcador.sql`. Ele cria `public._ambiente` com o valor `'staging'`. **Esse arquivo só existe para staging.** Seed e reset recusam rodar sem esse marcador, e por isso nunca rodam em produção por engano.
3. **Configurar a autenticação.**
   - Em *Authentication*, crie o usuário `admin@cantina.local` com uma senha **diferente** da de produção.
   - Desligue o *Allow new users to sign up*.
4. **Configurar o app local.**
   - Em *Settings → API*, copie a URL e a chave publishable.
   - Crie o arquivo `.env.staging.local`, que já é ignorado pelo `*.local` no `.gitignore`, com `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` e `VITE_DEV_ADMIN_*` de staging.
5. **Rodar.**
   - `npm run dev:staging`, um script novo que roda `vite --mode staging`.
   - `npm run dev` continua sendo produção, exatamente como hoje. **O `.env` de produção nunca é editado.**

### Alternância segura e banco visível na tela

- **O risco do modo do Vite:** `vite --mode staging` carrega o `.env` **e por cima** o `.env.staging.local`. Se faltar uma variável no arquivo de staging, ela cai silenciosamente no valor de produção.
- **Proteção:** um módulo novo, `src/config/ambiente.ts`, valida a configuração **antes** de criar o client do Supabase.
  - O "banco conectado" é **deduzido da URL real**. A ref vem do subdomínio e é comparada com a ref de produção.
    - A ref de produção é pública: já está versionada em `supabase/config.toml`. Não é credencial.
    - Ref igual à de produção = `PRODUÇÃO`. Ref diferente = `STAGING (<ref>)`.
    - Não depende de nenhuma flag que alguém possa esquecer.
  - A **tela de erro bloqueante, com texto explicando o problema**, aparece nestes casos:
    - modo `staging` com URL de produção;
    - `VITE_SUPABASE_PROJECT_ID` diferente da ref da URL;
    - URL ou chave faltando.

    Isso substitui a tela em branco de hoje. O `main.tsx` renderiza a tela de erro em vez do `<App/>`.
- **Na tela:**
  - **Staging:** faixa amarela fixa no topo, "STAGING — banco de testes (ref …)", e o título da aba começando com `[STAGING]`.
  - **Produção:** uma etiqueta discreta "Produção" no header.

### Seed de staging: `supabase/staging/seed.sql`

- **Guarda e reset.** Começa abortando se `_ambiente` não for `'staging'`. Em seguida faz o reset descrito abaixo, e por isso **rodar o seed de novo sempre volta ao mesmo estado**.
- **Datas sempre relativas a hoje.**
  - Usa `periodo_de(...)` com a âncora configurada (dia 6, padrão). Os períodos são `P1..P4` = os 4 períodos encerrados mais recentes, calculados a partir de `(now() AT TIME ZONE 'America/Sao_Paulo')::date`.
  - Cada lançamento cai no "dia 2 do período Pk, às 10:00 de São Paulo". O seed nunca envelhece.
- **Lançamentos.** Os lançamentos ficam **antes dos cortes**. São inseridos direto, com `data` retroativa, porque roda como `postgres`. No fim, o seed ajusta `saldo_atual = razão` em cada ficha, e por isso a checagem de divergência passa.
- **Fichas** (números 901–908, que só existem em staging):

  | Ficha | Situação | Resultado esperado |
  |---|---|---|
  | 901 | Normal, compra só no período corrente | Sem atraso |
  | 902 | Bloqueada, sem dívida antiga | Badge sólido, sem atraso |
  | 903 | Compra em P4 (o mais recente) não paga | Atraso 1 |
  | 904 | Compra em P3 não paga | Atraso 2 |
  | 905 | Compra em P1 não paga | Atraso 3+ |
  | 906 | Igual à 905, porém bloqueada | Pior caso visual |
  | 907 | Compra em P3 não paga, com anotação | Anotação + atraso na Nova Venda |
  | 908 | Compra em P1, pagamento que zera em P2, nova compra em P3 | Testa a regra 6: item de P1 nasce quitado na data do pagamento, P3 fica em aberto (atraso 2) |

- **O seed não fecha nenhum período.** Os 4 pendentes são fechados por você, pelo botão, um por clique. É isso que testa o fluxo real.

### Restaurar staging

- **`supabase/staging/reset.sql`.** Tem a mesma guarda do marcador. Faz:
  - `TRUNCATE fechamento_itens, periodos_fechamento, configuracao_historico, pagamentos, compras, fechamentos, fiadores RESTART IDENTITY CASCADE`;
  - volta `configuracao` para o dia 6.

  Como `TRUNCATE` não dispara triggers de DELETE, nada bloqueia o reset.
- **Caminho normal:** rodar o `seed.sql` de novo, que já chama o reset.
- **Se o schema de staging quebrar:** apagar o projeto e refazer os passos 1 a 3. Leva uns 5 minutos.

### Galeria visual temporária

- **Onde fica:** `galeria.html`, na raiz, e `src/galeria/main.tsx`.
  - É uma **entrada separada do Vite**: o servidor de dev serve em `http://localhost:8080/galeria.html`.
  - **Correção (produção = `npm run dev` nesta máquina):** não existe build. Enquanto a galeria existir na pasta, o servidor do caixa também a serve em `/galeria.html`. Isso é inofensivo: são só dados simulados, não toca no banco e não tem link na navegação. Mesmo assim, ela **não deve estar na pasta do caixa** num checkout de produção: fica só na pasta de desenvolvimento e é removida na 3g.
  - **Não toca** em `App.tsx`, nem nas rotas, nem na navegação.
- **O que mostra:** os 6 casos lado a lado, mais o card da Nova Venda com anotação e atraso. Usa **só dados simulados**, montando as mesmas peças puras do app:
  - `EstadoContaBadge`;
  - `AtrasoChip` e `classeLinhaAtraso`;
  - `FichaSelecionadaCard`, o card da etapa 2, que é extraído do `NovaVendaDialog` justamente para poder ser reaproveitado.
- **Não importa** hooks nem `@/integrations/supabase/client`.
  - É conferido com `grep -rn "supabase\|use[A-Z]" src/galeria`, que precisa voltar vazio para hooks e client.
  - Por isso funciona até sem o `.env`.
- **Remoção:** um único comando, `git rm -r galeria.html src/galeria`. O critério de pronto é `grep -rn "galeria" --include=*.ts* --include=*.html .` (fora de `node_modules`) voltar vazio.

## Backup e restauração (correção 1)

**Regra:** nenhuma migration toca produção sem um **backup novo, feito imediatamente antes**, **cuja restauração já foi testada em staging**. Isso vale para as etapas 1, 2, 4 e 5, e para qualquer migration futura. Backup que nunca foi restaurado não conta como backup.

### Exportar (feito por você, no PowerShell)

1. **Instale as ferramentas de linha de comando do PostgreSQL.**
   - Use o instalador da EDB e marque só "Command Line Tools". A versão precisa ser **maior ou igual** à do banco, que aparece com `SELECT version();` no SQL Editor.
   - Não vamos usar `supabase db dump`, porque ele exige Docker.
2. **Pegue a string de conexão.** No painel do Supabase, *Connect → Session pooler*, que funciona em IPv4.
   - A senha é a **senha do banco**, não a chave publishable.
   - A senha fica só na variável da janela do PowerShell, nunca em arquivo.
3. **Exporte.** A pasta fica **fora do repositório**: o repo é público, e o arquivo de backup contém dados de alunos.

   ```powershell
   $env:PGPASSWORD = '<senha do banco>'          # só vale nesta janela
   $conn = 'host=aws-0-<regiao>.pooler.supabase.com port=5432 dbname=postgres user=postgres.<ref> sslmode=require'
   $dir  = 'C:\Users\depao\Backups\cantina'      # FORA do repositório
   $data = Get-Date -Format 'yyyyMMdd-HHmm'
   New-Item -ItemType Directory -Force $dir | Out-Null
   pg_dump $conn --schema=public --format=custom --no-owner --file "$dir\cantina-$data.dump"
   psql $conn -A -c "<consulta de contagem abaixo>" > "$dir\cantina-$data-contagem.txt"
   pg_restore --list "$dir\cantina-$data.dump" | Select-String 'TABLE DATA'   # precisa listar as tabelas
   ```

4. **Grave a contagem de referência.** Ela é gravada junto com o dump e serve de prova da restauração:

   ```sql
   SELECT 'fiadores' t, count(*), coalesce(sum(saldo_atual),0) FROM fiadores
   UNION ALL SELECT 'compras',     count(*), coalesce(sum(valor),0) FROM compras
   UNION ALL SELECT 'pagamentos',  count(*), coalesce(sum(valor),0) FROM pagamentos
   UNION ALL SELECT 'fechamentos', count(*), coalesce(sum(total),0) FROM fechamentos
   -- a partir da etapa 2, acrescentar periodos_fechamento, fechamento_itens,
   -- periodo_divergencias, configuracao e configuracao_historico
   ORDER BY 1;
   ```

5. **Cópia extra, opcional.** Exporte cada tabela em CSV pelo *Table Editor → Export*. Serve para consultar, não para restaurar.
6. **Não conte com o backup automático do Supabase.** Ele depende do plano contratado. Confira em *Database → Backups*. Mesmo que exista, este procedimento continua obrigatório.

### Testar a restauração (sempre em staging, nunca em produção)

A cópia restaurada contém **dados reais de alunos** num banco com credenciais mais fracas (ajuste 4 da v5). Por isso a restauração segue um roteiro fechado, feito **numa única sessão sentada**:

1. **Pré-requisitos, todos obrigatórios. Se um falhar, não restaure:**
   - [ ] Em staging, *Authentication → Sign In / Providers*: "Allow new users to sign up" **desligado**.
   - [ ] Em staging, *Authentication → Users*: só existe o `admin@cantina.local` de staging.
   - [ ] Você tem tempo para ir do passo 2 ao 5 sem interrupção.
2. **Restaurar:**
   ```powershell
   $stg = '<string de conexão do projeto STAGING>'
   pg_restore --clean --if-exists --no-owner -d $stg "$dir\cantina-$data.dump"
   psql $stg -A -c "<mesma consulta de contagem>"    # tem que ser IDÊNTICA ao .txt
   ```
3. **Conferir.** A contagem e as somas precisam bater linha por linha. Se o `pg_restore` reclamar de schema, extensões ou permissões, ajusto os comandos aqui no plano **antes** de qualquer migration em produção. É para descobrir isso que o teste existe.
4. **Ensaio geral**, se a etapa tiver migration: aplique a migration da etapa sobre essa cópia **imediatamente**. É o único motivo para a cópia existir além da contagem.
5. **Apagar os dados reais de staging. Obrigatório, logo em seguida, na mesma sessão:**
   - rode `staging/reset.sql` e depois `staging/seed.sql`;
   - confira com `SELECT numero_ficha FROM fiadores ORDER BY 1;`, que deve listar **só 901–908**.
   - A tabela marcadora `_ambiente` não vem no dump de produção, então continua lá e as guardas seguem funcionando.
6. **A cópia real nunca fica parada em staging** entre uma etapa e outra, nem durante a noite. Se a sessão for interrompida no meio, a primeira ação da próxima é o passo 5.

> Ajuste em relação ao seu pedido. Você pediu "apagar logo após conferir a contagem". Mantive o ensaio da migration entre a contagem e a limpeza, mas **na mesma sessão e sem pausa**, porque ensaiar a migration com os dados reais é o que pega as divergências reais antes de produção. Se preferir apagar antes do ensaio, o passo 4 passa a rodar só sobre o seed.

### Restaurar produção (emergência)

Antes do backup completo existem duas camadas mais leves:

1. **Toda migration roda dentro de `BEGIN; … COMMIT;`.** Se falhar no meio, nada é aplicado e não há o que restaurar.
2. **Toda migration de produção vem com a sua migration de rollback** (etapas 1, 2, 4 e 5, não só a 5). Se o app quebrar depois de aplicar, a primeira opção é o rollback da etapa.

Restaurar o dump é o **último recurso**, porque perde tudo o que foi lançado depois do backup:

1. **Pare o caixa.**
2. **Exporte do banco atual os lançamentos posteriores ao horário do backup:**
   ```sql
   SELECT * FROM compras WHERE data > '<hora do backup>';
   SELECT * FROM pagamentos WHERE data > '<hora do backup>';
   ```
   Salve em CSV.
3. **Restaure:**
   ```powershell
   pg_restore --clean --if-exists --no-owner -d $conn "<dump>"
   ```
4. **Confira a contagem** contra o `.txt` do backup.
5. **Relance pelo app** as vendas e pagamentos exportados no passo 2. Use o app, não SQL, para manter razão e saldo iguais.

Por isso o backup é feito **logo antes** de aplicar, **fora do horário de movimento**.

### Rollback da etapa 2: a janela em que ele deixa de ser seguro (ajuste 2 da v5)

- **Antes do primeiro fechamento em produção,** o rollback da etapa 2 é inócuo: ele dropa as tabelas novas e recria as RPCs antigas, e não existem dados reais nelas.
- **Depois do primeiro fechamento em produção,** o rollback **apaga fechamentos reais**, porque `DROP TABLE periodos_fechamento / fechamento_itens / periodo_divergencias` leva tudo junto.
- **Proteção no arquivo.**
  - O cabeçalho da migration de rollback traz este aviso:

    ```sql
    -- ██████████████████████████████████████████████████████████████████████
    -- ██  PERIGO — SÓ RODE ESTE ROLLBACK ANTES DO PRIMEIRO FECHAMENTO REAL.  ██
    -- ██  Depois que existir qualquer linha em periodos_fechamento, este      ██
    -- ██  arquivo APAGA FECHAMENTOS REAIS. NÃO RODE. Veja "alternativa".      ██
    -- ██████████████████████████████████████████████████████████████████████
    ```

  - O primeiro comando é uma guarda que **aborta a transação inteira** se `periodos_fechamento` tiver qualquer linha. Isso vale também para quem não ler o aviso.
- **Alternativa depois da janela:**
  1. **Correção para frente.** É o caminho preferido, porque quase todo defeito da etapa 2 estará na lógica de uma função. Uma migration nova faz `CREATE OR REPLACE` da função corrigida, sem tocar em dados.
  2. **Restaurar um dump.** Só em último caso, e **não** o dump de antes da etapa 2, porque ele não tem os fechamentos. Use o backup mais recente, feito antes da operação que deu problema. Aplique o roteiro de emergência acima, relançando pelo app o que entrou depois do backup.
- **Regra derivada:** além do backup antes de cada migration, faça **um backup logo antes de fechar o primeiro período real em produção**. Ele marca o início da janela.

### Na implementação

- Acrescentar `*.dump` e `*-contagem.txt` ao `.gitignore`, como segunda proteção.
- Registrar no CLAUDE.md a regra "backup + restauração testada antes de toda migration em produção".

## Tratamento de divergência razão × saldo (etapa 0b, ajuste 3 da v5)

**Quando entra:** se a etapa 0 encontrar alguma ficha real com `saldo_atual ≠ Σ compras − Σ pagamentos`. Divergência não resolvida antes da etapa 2 vira confirmação obrigatória em **todo** fechamento, então ela precisa ser resolvida aqui, uma ficha por vez.

### 1. Investigar a origem (só leitura)

Para cada ficha divergente:

```sql
-- (a) o razão em ordem, com saldo acumulado; a última linha mostra o que o razão diz
WITH mov AS (
  SELECT data, 1 AS ordem, valor  AS delta, descricao                     AS texto, id FROM compras    WHERE fiador_id = '<id>'
  UNION ALL
  SELECT data, 2,          -valor,          coalesce(observacao,'Pagamento'),       id FROM pagamentos WHERE fiador_id = '<id>')
SELECT data AT TIME ZONE 'America/Sao_Paulo' AS quando,
       CASE ordem WHEN 1 THEN 'compra' ELSE 'pagamento' END AS tipo,
       delta, texto,
       sum(delta) OVER (ORDER BY data, ordem, id) AS saldo_pelo_razao
FROM mov ORDER BY data, ordem, id;

-- (b) o que a ficha diz, e quando foi alterada por último
SELECT numero_ficha, nome_aluno, saldo_atual,
       created_at AT TIME ZONE 'America/Sao_Paulo' AS criada,
       updated_at AT TIME ZONE 'America/Sao_Paulo' AS ultima_alteracao
FROM fiadores WHERE id = '<id>';
```

**Como ler o resultado:**

- **Diferença = valor exato de uma compra ou pagamento conhecido**, por exemplo o que a família diz que comprou ou pagou. Sugere um lançamento **apagado direto** ou **nunca lançado**. A policy de DELETE em `compras` existe desde agosto, e o SQL Editor também apaga.
- **`ultima_alteracao` posterior ao último lançamento do razão.** A ficha foi editada depois do último movimento.
  - Atenção: trancar, anotar ou editar nome **também** atualizam `updated_at`. Isso é indício, não prova.
  - Se nenhuma dessas ações aconteceu, aponta para uma edição direta do saldo, pelo *Table Editor* ou por SQL.
- **Diferença sem relação com nenhum lançamento,** em ficha antiga, criada antes de agosto. Pode ser da época anterior à RPC, quando o app lia e regravava o saldo pelo client e uma venda simultânea podia se perder.
- **Confirme com o mundo real:** a ficha de papel, o caderno, ou a própria família. Essa conversa decide qual dos dois lados está certo.

### 2. Qual correção é a certa

O razão é a fonte da verdade do histórico. Depois da correção, **razão e saldo têm que bater**. A pergunta é **qual dos dois conta a verdade**:

| Situação confirmada | Correção certa |
|---|---|
| A família **deve o que o razão diz**. O `saldo_atual` é que se corrompeu: edição manual errada ou incremento perdido. | **A — Ajustar o saldo ao razão.** |
| A família **deve o que o `saldo_atual` diz**. Falta ou sobra um movimento no razão: compra apagada direto, pagamento recebido e nunca lançado. | **B — Lançar um movimento de acerto no razão.** |
| **Origem não identificada.** | **B, datado de hoje, como padrão.** |

Por que B é o padrão quando não se sabe a origem:

- O `saldo_atual` é o valor que vinha sendo **mostrado e cobrado** da família.
- Mudar a dívida de alguém sem explicação seria pior do que deixar o acerto **visível no extrato**.

Consequência a aceitar no caso B datado de hoje: a reconstrução dos períodos **passados** não enxerga o acerto. Só os cortes a partir de hoje o incluem.

Se você souber a data de origem, o acerto B pode ser **datado retroativamente** nessa data, e aí os períodos passados também ficam certos.

**Nunca fazer A e B na mesma ficha.**

### 3. Registro do que foi corrigido

A tabela de auditoria `correcoes_saldo` vem numa migration pequena, a **0b**, só se houver divergência. Ela segue a regra de backup antes, como toda migration de produção.

```sql
CREATE TABLE public.correcoes_saldo (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  corrigido_em   timestamptz NOT NULL DEFAULT now(),
  fiador_id      uuid REFERENCES public.fiadores(id) ON DELETE SET NULL,
  numero_ficha   text NOT NULL,
  saldo_antes    numeric(10,2) NOT NULL,
  razao_antes    numeric(10,2) NOT NULL,
  tipo           text NOT NULL CHECK (tipo IN ('ajuste_saldo','acerto_razao')),
  movimento_id   uuid,              -- id da compra/pagamento de acerto (tipo B)
  motivo         text NOT NULL CHECK (length(trim(motivo)) >= 10),  -- explicação obrigatória
  CONSTRAINT correcao_real CHECK (saldo_antes <> razao_antes)
);
ALTER TABLE public.correcoes_saldo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read correcoes_saldo"
  ON public.correcoes_saldo FOR SELECT TO authenticated USING (true);
-- sem policy de escrita: só o SQL Editor (postgres) grava aqui
```

### 4. SQL de cada correção

Roda no SQL Editor, **uma ficha por transação**, depois de um backup. Cada bloco grava a auditoria e **confere no fim** que razão e saldo batem. Se não baterem, ele aborta tudo.

```sql
-- ===== A — AJUSTAR O SALDO AO RAZÃO =====
BEGIN;
WITH r AS (
  SELECT f.id, f.numero_ficha, f.saldo_atual,
         coalesce((SELECT sum(valor) FROM compras    WHERE fiador_id = f.id),0)
       - coalesce((SELECT sum(valor) FROM pagamentos WHERE fiador_id = f.id),0) AS razao
  FROM fiadores f WHERE f.id = '<id>' FOR UPDATE OF f)
INSERT INTO correcoes_saldo (fiador_id, numero_ficha, saldo_antes, razao_antes, tipo, motivo)
SELECT id, numero_ficha, saldo_atual, razao, 'ajuste_saldo', '<motivo: o que foi confirmado e com quem>' FROM r;

UPDATE fiadores f SET saldo_atual =
         coalesce((SELECT sum(valor) FROM compras    WHERE fiador_id = f.id),0)
       - coalesce((SELECT sum(valor) FROM pagamentos WHERE fiador_id = f.id),0)
 WHERE f.id = '<id>';

DO $$ BEGIN   -- conferência final; não depende de nada da etapa 2
  IF (SELECT f.saldo_atual
           - ( coalesce((SELECT sum(valor) FROM compras    WHERE fiador_id = f.id),0)
             - coalesce((SELECT sum(valor) FROM pagamentos WHERE fiador_id = f.id),0) )
        FROM fiadores f WHERE f.id = '<id>') <> 0 THEN
    RAISE EXCEPTION 'Ainda diverge — abortando';
  END IF;
END $$;
COMMIT;

-- ===== B — LANÇAR ACERTO NO RAZÃO (o saldo NÃO muda) =====
-- Saldo > razão (falta débito no razão)        → INSERT em compras    com valor = saldo − razão
-- Saldo < razão (falta pagamento/sobra débito) → INSERT em pagamentos com valor = razão − saldo
-- É INSERT direto, e não RPC, porque a RPC mexeria no saldo, que já está certo.
BEGIN;
SELECT saldo_atual FROM fiadores WHERE id = '<id>' FOR UPDATE;
WITH r AS (
  SELECT f.id, f.numero_ficha, f.saldo_atual,
         coalesce((SELECT sum(valor) FROM compras    WHERE fiador_id = f.id),0)
       - coalesce((SELECT sum(valor) FROM pagamentos WHERE fiador_id = f.id),0) AS razao
  FROM fiadores f WHERE f.id = '<id>'),
mov AS (                      -- exemplo para o caso saldo > razão
  INSERT INTO compras (fiador_id, descricao, valor, data, mes_referencia)
  SELECT id, 'Acerto de saldo — <motivo curto>', saldo_atual - razao,
         '<data da origem ou now()>',
         to_char(('<mesma data>')::timestamptz AT TIME ZONE 'America/Sao_Paulo','YYYY-MM')
  FROM r WHERE saldo_atual > razao
  RETURNING id)
INSERT INTO correcoes_saldo (fiador_id, numero_ficha, saldo_antes, razao_antes, tipo, movimento_id, motivo)
SELECT r.id, r.numero_ficha, r.saldo_atual, r.razao, 'acerto_razao', mov.id, '<motivo completo>'
FROM r, mov;
-- mesma conferência final do bloco A
COMMIT;
```

- **O texto final do SQL é revisado comigo, ficha a ficha, com os valores reais**, antes de você rodar. Os blocos acima são o molde.
- Depois de corrigir todas as fichas, rode de novo a consulta de divergência da etapa 0. Ela deve voltar vazia.

## Fora do escopo deste plano (correção 6)

- **Ficam de fora de propósito:**
  - envio de cobrança pelo **WhatsApp**;
  - **cópia de extrato** (texto para colar e mandar ao responsável);
  - **dashboard** de inadimplência e indicadores.

  Nenhum deles é implementado aqui. Também não aparecem botões de mentira na tela.
- **Já fica preparado para eles:** a aba Fechamento da etapa 3 reserva as áreas de ações por ficha, de ações em lote no cabeçalho e de indicadores. Os hooks já carregam os dados que esses recursos vão usar (ver e). Eles entram depois sem refazer a tela.

### Etapa S — implementada (09/10)

**Arquivos:**

| Tipo | Arquivos |
|---|---|
| Novos | `src/config/ambiente.ts` (+ `ambiente.test.ts`), `src/components/ErroConfiguracao.tsx`, `src/components/AmbienteIndicador.tsx`, `supabase/staging/{00-marcador.sql, reset.sql, seed.sql, LEIAME.md}` |
| Alterados | `src/main.tsx`, `src/integrations/supabase/client.ts`, `src/App.tsx`, `src/pages/Index.tsx` (etiqueta no header), `package.json` (`dev:staging`), `.env.example`, `.claude/launch.json` (servidores de verificação nas portas 8085/8090) |

**Decisões tomadas na implementação:**

- **`VITE_SUPABASE_PROJECT_ID` obrigatória só em modo staging.** Em produção ela é conferida se existir, mas não é exigida. Assim um `.env` local sem essa variável não para o caixa.
- **O marcador recusa rodar se `fiadores` tiver qualquer linha.** É a proteção contra rodar o marcador em produção por engano.
- **Seed e reset funcionam no schema atual**, antes da etapa 2. O reset limpa só as tabelas que existirem. O seed lê `configuracao.dia_fechamento` quando a tabela existir e usa 6 como padrão.
- **O seed e o reset foram testados num Postgres local (PGlite), fora do projeto:**
  - [x] recusam um banco sem marcador e deixam os dados intactos;
  - [x] o marcador recusa um banco com fichas;
  - [x] o seed gera os saldos esperados, sem divergência, e é idempotente;
  - [x] a âncora acerta os meses curtos;
  - [x] o reset zera tudo e mantém o marcador.

## Etapas de implantação (o usuário roda o SQL; o front de produção é ESTA máquina)

**Não existe hospedagem, build nem deploy.** O caixa roda `npm run dev` na pasta do projeto, nesta máquina, com o `.env` local. Por isso, nas etapas abaixo:

- **"Aplicar o front em produção"** significa:
  1. fora do expediente, anotar `git rev-parse HEAD` (o ponto de retorno);
  2. Ctrl+C no servidor;
  3. `git checkout <branch ou commit>`;
  4. `npm install`, só se `package.json` ou `package-lock.json` mudaram;
  5. `npm run dev`;
  6. conferir a etiqueta "Produção" e as fichas.
- **"Voltar o front"** significa: Ctrl+C, `git checkout <hash anotado>`, `npm run dev`, F5.
- **O que vale é o `.env` local.** Antes de cada checkout, confira:
  - que só existem `.env` e `.env.example` (`Get-ChildItem -Force .env*`);
  - a URL e o `PROJECT_ID` (`Select-String -Path .env -Pattern '^VITE_SUPABASE_(URL|PROJECT_ID)='`).
- **O banco continua separado do código.** As migrations são rodadas por você no SQL Editor, com o roteiro de backup, e o código entra por checkout. Quando uma etapa tem SQL e front, a ordem vem de cada etapa (por exemplo, o front das sub-etapas 3c–3f só entra depois da etapa 2 aplicada no banco).
- **⚠️ HMR.** Com o `npm run dev` do caixa rodando, qualquer arquivo salvo ou checkout nesta pasta vai para o caixa na hora. **O desenvolvimento das etapas não pode acontecer nesta pasta durante o expediente** (ver a pergunta em aberto sobre a pasta de desenvolvimento separada).

**Cada etapa roda primeiro em staging e só depois em produção.**

**Antes de cada migration em produção (etapas 1, 2, 4 e 5), nesta ordem:**
1. migration validada em staging com o seed;
2. backup novo de produção, feito por você;
3. restauração desse backup em staging, conferida pela contagem;
4. ensaio da migration sobre essa cópia real;
5. aplicação em produção, dentro de `BEGIN…COMMIT` e fora do horário de movimento;
6. staging volta ao seed.

| Etapa | Conteúdo | Verificação |
|---|---|---|
| S | Staging criado por você (passo a passo acima) + `ambiente.ts`/banner/tela de erro + `dev:staging` + seed e reset | O banner mostra STAGING; `npm run dev` mostra Produção; os casos de erro de configuração caem na tela de erro |
| B | **Primeiro backup de produção + primeiro teste de restauração em staging**, seguindo o procedimento acima. Roda antes da etapa 0 e antes de qualquer migration. A etapa S só cria o projeto vazio, sem tocar em produção. | Contagem restaurada idêntica à do `.txt`, e o app em staging mostra as mesmas fichas e saldos |
| 0 | Pré-checagem só de leitura (apêndice), com o volume real + snapshot de policies, grants e `prosecdef` + checar signup | Resultado revisado e divergências entendidas |
| 0b | **Só se a etapa 0 achar divergência:** migration `correcoes_saldo` + correções ficha a ficha (seção "Tratamento de divergência") | Consulta de divergência volta vazia; `correcoes_saldo` tem uma linha por ficha corrigida |
| 1 | `registrar_compra` e `registrar_pagamento` passam a DEFINER, com REVOKE do `anon`, nova ordem de travas e `ROW_COUNT` + **rollback da etapa** (volta às versões INVOKER atuais) | Venda e pagamento funcionam no app; chamada como `anon` é negada |
| 2 | Schema de fechamento (inclusive `periodo_divergencias`), views, RPCs novas, quitação no pagamento, triggers + **migration de rollback da etapa** | Testes da etapa 2 (abaixo) em staging, mais a medição de lock com `carga.sql` |
| 3 | Front, quebrado nas sub-etapas 3a a 3g (abaixo) | Ver cada sub-etapa |
| 4 | `DROP FUNCTION fechar_mes` + `DROP POLICY` de insert em `fechamentos` + **rollback da etapa** (recria os dois exatamente como hoje) | O caixa já roda o código novo (checkout da 3d feito nesta máquina e `npm run dev` reiniciado); nada mais chama `fechar_mes` |
| 5 | Endurecimento + migration de rollback | Fluxos completos do caixa em staging e depois em produção, com o rollback à mão |

### Etapa 3 quebrada em sub-etapas (ajuste 1 da v5)

Cada sub-etapa termina com:

- `npx tsc --noEmit -p tsconfig.app.json`;
- verificação no navegador;
- **a tela funcionando**.

Nenhuma deixa um caminho do app quebrado no meio.

**Ajustei o seu corte num ponto.** Separei "atraso nas telas existentes" (lista de Fichas, detalhe e etapa 2 da Nova Venda) numa sub-etapa própria, a **3e**. Na sua sugestão ele ficava espremido entre a 3b, que ainda não tem dados, e a 3d, que é a aba nova. Com isso, Configurações vira **3f** e o fechamento da etapa vira **3g**.

| Sub | Conteúdo | Depende de | Pode ir para produção quando |
|---|---|---|---|
| **3a** | `EstadoContaBadge` centralizado em `Index.tsx`, `FichaDetalheDialog.tsx` e `NovaVendaDialog.tsx`, **com o visual atual**. Verificação: nada mudou na tela. | nada | a qualquer momento (só UI, sem banco) |
| **3b** | Visual sólido do badge nos 3 lugares + `AtrasoChip` + `classeLinhaAtraso` + `FichaSelecionadaCard` extraído do `NovaVendaDialog` + galeria (`galeria.html`). O atraso ainda **não** aparece nas telas reais. | 3a | a qualquer momento, mas o checkout no caixa deve ser de um commit **sem** a galeria (ou só depois da 3g) |
| **3c** | Hooks novos em `useFechamentos.ts` (`useProximosPeriodos`, `useAtrasos`, `useDivergencias`, `useFecharPeriodo`, `usePeriodos`, `useFechamentosLegado`, `useConfiguracao`, `useSimularTrocaDia`, `useDefinirDia`) + `useDeleteFicha` com checagem + invalidações no `useRegistrarPagamento`. **`useFecharMes` continua** (a seção de Relatórios ainda o usa). Nenhuma tela muda. | etapa 2 aplicada **em staging** (para testar) | depois da etapa 2 **em produção** |
| **3d** | Aba **Fechamento** com as áreas reservadas + badge de pendência na nav + **remoção** da seção "Fechamento Mensal" de Relatórios e do `useFecharMes`. | 3b, 3c | depois da etapa 2 em produção |
| **3e** | Atraso nas telas existentes: faixa e chip na lista de Fichas, chip no título do detalhe, chip na etapa 2 da Nova Venda (junto da anotação). A etapa 1 continua sem atraso. | 3b, 3c | depois da etapa 2 em produção |
| **3f** | Tela de **Configurações**: dia-âncora com simulação, bloqueios (pendência e transição aberta), histórico de trocas e "Integridade do razão". | 3c, 3d (link "Ir para Fechamento") | depois da etapa 2 em produção |
| **3g** | CLAUDE.md (regras de staging, backup e o que mudou), `.gitignore` (`*.dump`, `*-contagem.txt`), **remoção da galeria** (`git rm -r galeria.html src/galeria`). | todas as anteriores | encerra a etapa 3 |

**O que pode rodar em sessões separadas:**

- **Todas.** Cada sub-etapa é uma sessão própria e termina num estado estável.
- **Em paralelo, só 3a e 3c.** 3a mexe em `Index.tsx`, `FichaDetalheDialog.tsx` e `NovaVendaDialog.tsx`; 3c mexe só em `src/hooks/`. Não há arquivo em comum.
- **3d, 3e e 3f precisam ser sequenciais**, porque todas mexem em `Index.tsx`.
- **3a e 3b não dependem da etapa 2.** Dá para fazê-las antes, inclusive enquanto o staging é preparado.
- **O checkout de 3c em diante na pasta do caixa só acontece depois da etapa 2 aplicada no banco de produção.** Até lá, o caixa continua no commit anterior, anotado por hash, e esse código fica numa branch, desenvolvida fora da pasta do caixa.

### Decisões pendentes, porque produção é esta máquina (levantadas em 09/10)

1. **Pasta de desenvolvimento separada.** Com o HMR, qualquer edição na pasta do caixa vai para o caixa na hora.
   - **Proposta:** `git worktree add ..\cantina-dev <branch>`. É uma segunda pasta do mesmo repositório, com `node_modules` e `.env.staging.local` próprios.
   - O desenvolvimento das etapas acontece nela. A pasta do caixa só muda por checkout deliberado, fora do expediente.
2. **O que o caixa roda hoje.** A pasta do caixa está na branch `feature/account-closing` (etapa S). Se o `npm run dev` for iniciado agora, o caixa roda essa branch. O código da etapa S foi verificado e é seguro para produção, mas a decisão de rodá-lo no caixa é sua.
3. **Exposição na rede.** O `host: "::"` em `vite.config.ts`, somado ao login desligado, deixa o caixa aberto a qualquer um na mesma rede, inclusive VPN e hotspot.
   - Restringir a `localhost` só funciona se ninguém abrir o caixa de outro aparelho (tablet ou celular).

## f) Casos de borda

- **Ficha criada depois do corte:** não tem razão naquele período, então não gera item.
- **Período sem devedores:** é registrado com zero itens.
- **Fechamentos em sequência no mesmo dia:** saem com valores diferentes, porque cada um usa o seu corte.
- **Item retroativo quitado por um pagamento anterior a ele:** a quitação é inferida na criação.
- **Fuso:** os cortes são à meia-noite de São Paulo, e a zona nomeada cobre todo o histórico.
- **Teste em produção:** rodar `fechar_periodo` cria um período **real** com todas as fichas devedoras, e as fichas 997–999 não isolam isso. O caminho é usar um projeto de staging com o `setup-completo.sql`, ou um script `BEGIN … ROLLBACK`.
- **Legado e novo cobrindo as mesmas compras:** os dois aparecem separados, e só o novo conta no atraso.
- **Divergência aceita:** os itens desse período foram calculados pelo razão, mas a quitação ao vivo usa o `saldo_atual`. Para as fichas divergentes, as duas fontes podem discordar até alguém corrigir.
- **Anotação × atraso:** a anotação está em âmbar (`warning`), não em laranja. Por isso o atraso de nível 1 (amarelo) usa um chip com ícone, para não se confundir com ela.

## Verificação (quando implementar)

1. `npx tsc --noEmit -p tsconfig.app.json`. O `tsc` na raiz não checa nenhum arquivo.
2. Testes da etapa 2, em staging ou com `BEGIN…ROLLBACK`:
   - **Pendentes:**
     - [ ] Começam na primeira compra.
     - [ ] Não incluem período que ainda não terminou.
     - [ ] Os meses curtos respeitam a âncora (N=31 em fevereiro e em mês de 30 dias).
   - **Valores:**
     - [ ] Dois fechamentos em sequência gravam valores diferentes.
     - [ ] Uma ficha que deveu em novembro, quitou em dezembro e voltou a dever em janeiro tem o item de novembro nascendo quitado na data de dezembro.
   - **Clique duplo:** o segundo dá "Período já fechado".
   - **Invariante de encadeamento:**
     - [ ] Um INSERT manual que deixe buraco ou sobreposição é rejeitado pelo trigger ou pela constraint.
     - [ ] A query `SELECT … WHERE data_inicio <> lag(data_fim) OVER (ORDER BY data_inicio) + 1` não retorna nenhuma linha em toda a cadeia, **inclusive atravessando um período de transição**.
   - **Troca bloqueada:** com período pendente, `definir_dia_fechamento` é recusada e a mensagem lista os pendentes.
   - **Troca de dia:**
     - [ ] A simulação mostra a transição.
     - [ ] O aviso aparece quando a transição tem menos de 7 dias.
     - [ ] O histórico grava a troca.
     - [ ] O período de transição fica marcado como tal.
     - [ ] Nada do que já estava fechado muda.
   - **Divergência (correção 4):**
     - [ ] Uma divergência forçada faz o fechamento recusar e devolver a lista.
     - [ ] Confirmar com a lista **idêntica** fecha o período, e `periodo_divergencias` recebe uma linha por ficha, com `saldo_atual` e `saldo_razao` daquele instante.
     - [ ] Confirmar com uma lista **diferente** (outra divergência criada entre a tela e o clique) é recusado de novo.
   - **Conferência avulsa (correção 3):**
     - [ ] "Conferir agora" em Configurações lista as fichas divergentes, com os dois valores lado a lado.
     - [ ] Comparar `saldo_atual` e `updated_at` antes e depois da conferência prova que ela não alterou nenhum saldo.
     - [ ] Não existe nenhum botão de correção.
   - **Quitação (correção 2):**
     - [ ] **Pagamento parcial numa ficha com item aberto:** a RPC retorna **sem erro**, o pagamento é gravado, o `saldo_atual` cai, o item continua com `quitado_em IS NULL` e a pós-condição não dispara.
     - [ ] **Pagamento parcial numa ficha sem item nenhum:** passa sem erro.
     - [ ] O pagamento que zera o saldo quita **todos** os itens abertos da ficha.
     - [ ] O pagamento que deixa crédito (saldo < 0) também quita todos os itens abertos.
   - **Custo do lock (correção 5):**
     - [ ] Com `supabase/staging/carga.sql` (999 fichas e ~50 mil lançamentos, só em staging), medir `fechar_periodo` com `EXPLAIN (ANALYZE)` dentro de `BEGIN…ROLLBACK` e registrar o tempo no plano. Se passar de 2 s, o aviso do diálogo vira destaque.
     - [ ] **Venda durante o fechamento:** no SQL Editor, `BEGIN; SELECT 1 FROM fiadores FOR UPDATE; SELECT pg_sleep(4);`. Enquanto isso, registrar uma venda pelo app em staging. A venda deve **esperar e concluir** sem erro.
     - [ ] Repetir com o lock segurado por mais de 3 s enquanto se tenta fechar período: `fechar_periodo` deve desistir com a mensagem amigável.
   - **Exclusão de ficha:** é bloqueada quando há item aberto e permitida quando está tudo quitado. Nesse caso o histórico fica com número e nome congelados.
   - **Permissões:**
     - [ ] Chamada de RPC como `anon` é negada.
     - [ ] UPDATE direto em `fechamento_itens` é negado.
3. Navegador:
   - [ ] Badge e tooltip de pendência aparecem.
   - [ ] Selo de transição aparece.
   - [ ] Pior caso visual (bloqueada + 3 em atraso) na lista, no detalhe e na Nova Venda com anotação.
   - [ ] Etapa 1 sem atraso.
   - [ ] Venda continua liberada para ficha com atraso.
   - [ ] Saldo ao vivo nas listas.
4. Etapa 5, primeiro em staging e depois em produção:
   - **Venda e pagamento no navegador**, numa ficha de teste, com as policies já revogadas. É o critério para dar como pronto.
   - **Fluxos do caixa:** criar ficha, editar, trancar, anotar, marcar somente-crédito, vender, pagar, excluir ficha quitada e fechar período.
   - **Bloqueios:**
     - [ ] UPDATE direto em `saldo_atual` é negado e falha alto.
     - [ ] INSERT direto em `compras` é negado e falha alto.
      - **Rollback:** aplicar o rollback e conferir que o estado volta a ser idêntico ao snapshot.
   - **Migration de rollback:** recria as policies de INSERT, UPDATE e DELETE de `compras` e de INSERT de `pagamentos` exatamente como hoje, mais os grants de tabela. É entregue junto com a de revogação.

## Apêndice — Etapa 0 (só leitura)

```sql
-- volume real, para a estimativa de lock (correção 5)
SELECT (SELECT count(*) FROM fiadores) AS fichas,
       (SELECT count(*) FROM compras) AS compras,
       (SELECT count(*) FROM pagamentos) AS pagamentos;
SELECT count(*), min(mes_referencia), max(mes_referencia) FROM fechamentos;
SELECT count(*) FROM fiadores WHERE status = 'inativo';
SELECT min(data) AT TIME ZONE 'America/Sao_Paulo' AS primeira_compra FROM compras;
SELECT f.numero_ficha, f.saldo_atual, coalesce(c.t,0) - coalesce(p.t,0) AS saldo_razao
FROM fiadores f
LEFT JOIN (SELECT fiador_id, sum(valor) t FROM compras    GROUP BY 1) c ON c.fiador_id = f.id
LEFT JOIN (SELECT fiador_id, sum(valor) t FROM pagamentos GROUP BY 1) p ON p.fiador_id = f.id
WHERE f.saldo_atual <> coalesce(c.t,0) - coalesce(p.t,0);
-- snapshot para o rollback
SELECT * FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
 WHERE table_schema = 'public' ORDER BY table_name, grantee, privilege_type;
SELECT grantee, table_name, column_name, privilege_type FROM information_schema.column_privileges
 WHERE table_schema = 'public' AND table_name IN ('fiadores','compras','pagamentos');
SELECT proname, prosecdef, proacl FROM pg_proc WHERE pronamespace = 'public'::regnamespace;
```
