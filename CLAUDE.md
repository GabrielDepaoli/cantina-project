# Cantina Fiado

## O que é e para quem

Sistema de "fiado" (caderneta de crédito) usado no dia a dia do caixa do **Restaurante e Cantina Depaoli**. Cada aluno (conta *dependente*, com responsáveis) ou professor/funcionário (conta *independente*) tem uma **ficha** numerada com um saldo corrente. O operador registra vendas (que aumentam a dívida) e pagamentos (que a reduzem) e, no fim do mês, roda o fechamento mensal para arquivar as compras do período.

**Situação atual (14/10/2026): o sistema AINDA NÃO ESTÁ EM USO.** O banco (projeto `yqhiazfknioaxlyzobrz`) só tem dados de teste, e nenhum dado é real. É o **único ambiente**: serve para desenvolver e testar e, na entrada em uso, é limpo e vira o banco real (ver `docs/plano-fechamento.md`, v6, e `docs/estado-atual.md`).
- **Até a entrada em uso**, não valem o backup antes de migration, as fichas descartáveis 997/998/999 nem a restrição de editar a pasta do caixa. Pode resetar e semear o banco à vontade com os scripts de `supabase/desenvolvimento/` (ver o `LEIAME.md` de lá).
- **A partir da entrada em uso** (`supabase/desenvolvimento/entrada-em-uso.sql`), valem todas as regras de "dados reais" deste arquivo. Atualize este parágrafo nesse dia.
- Não existe staging: o modo staging foi removido na etapa A do plano, e o projeto `cantina-staging` não é usado.

## Stack e restrições

- React 18 + TypeScript + Vite 5 (porta 8080) + Tailwind 3 + shadcn-ui (Radix) + framer-motion + `@tanstack/react-query` 5.
- **App 100% front-end**, sem servidor próprio. O **Supabase é o único backend**: Postgres, Auth, RLS e funções RPC. O cliente fica em `src/integrations/supabase/client.ts`.
- Variáveis de ambiente (`.env`, nunca versionado; o template é `.env.example`): `VITE_SUPABASE_URL` (só a URL base, **sem** `/rest/v1/`), `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `VITE_DEV_ADMIN_EMAIL` e `VITE_DEV_ADMIN_PASSWORD`.
- **Validação do ambiente** (`src/config/ambiente.ts`). `main.tsx` valida as variáveis **antes** de carregar o app. Se algo estiver errado, mostra uma tela de erro (`src/components/ErroConfiguracao.tsx`) que diz qual variável está errada e o que fazer; não existe mais tela em branco. Regras:
  - URL e chave são obrigatórias. A URL aceita o que o `supabase-js` aceita (`http`/`https`, inclusive domínio personalizado do Supabase), mas **sem caminho**: com caminho, o `supabase-js` chamaria `.../rest/v1/rest/v1`.
  - `VITE_SUPABASE_PROJECT_ID` **ausente é tolerado**. **Presente e diferente** da ref da URL é erro.
  - As mensagens mandam corrigir o `.env` e reiniciar o `npm run dev`.
- O overlay de erro do Vite está desligado (`hmr.overlay: false`). Para ver erros de runtime, olhe o console do navegador.
- Testes (Vitest, `npx vitest run`): `src/config/ambiente.test.ts` cobre a validação do ambiente e `src/test/banco/` cobre o SQL (ver "Testes do banco" nas convenções). As telas não têm cobertura.
- O projeto nasceu no Lovable. Não sobrou branding dele, só restos de scaffold: `NavLink.tsx` e `App.css` sem uso.

## Produção: é ESTA máquina, com `npm run dev`

- **Não existe hospedagem, build nem deploy.** O caixa da cantina roda `npm run dev` **nesta pasta, neste computador**, na porta 8080, lendo o `.env` local.
  - "Ir para produção" significa **fazer `git checkout` nesta máquina e reiniciar o `npm run dev`**.
  - O que estiver checado out nesta pasta (branch ou commit) é o que o caixa roda.
- **Atualizar a produção** (fora do expediente):
  1. `git rev-parse HEAD` → anote o hash. É o ponto de retorno.
  2. Pare o servidor com Ctrl+C.
  3. `git checkout <branch ou commit>`.
  4. `npm run dev`.
  5. Confira no navegador se as fichas carregam.
  - Se `package.json` ou `package-lock.json` mudaram, rode `npm install` antes do passo 4.
- **Voltar atrás:**
  1. Ctrl+C.
  2. `git checkout <hash anotado>`.
  3. `npm run dev`.
  4. F5 no navegador.
- **⚠️ HMR: com o `npm run dev` do caixa rodando, tudo o que muda nesta pasta vai para o caixa NA HORA.** Isso inclui arquivo salvo, `git checkout`, `git stash` e alteração no `.env`, que faz o Vite reiniciar sozinho. **Não edite arquivos nem troque de branch nesta pasta durante o expediente.**
- **Rede:** `vite.config.ts` usa `host: "::"`, então o caixa fica acessível pelos IPs desta máquina (rede local, hotspot e VPN), não só por `localhost`. Ver dívida técnica.

## Convenções inegociáveis

- **Sinal do saldo:** `saldo_atual` **POSITIVO no banco = DÍVIDA; NEGATIVO = CRÉDITO.** A exibição inverte isso em `src/lib/saldo.ts` (`formatSaldo`): uma dívida aparece como `-R$ X.XX` e um crédito como `R$ X.XX (CRÉDITO)`. Nunca confunda os dois sinais, nem em SQL, nem em cálculo, nem em UI.
- **Toda mutação de saldo passa por função RPC atômica** (`registrar_compra`, `registrar_pagamento`). Nunca leia e depois escreva `saldo_atual` do client. Desde a migration `20261014120000_fechamento_contas.sql`, o banco **impõe** isso: `authenticated` não tem privilégio de escrever `saldo_atual`, nem de escrever direto em `compras`, `pagamentos` e nas tabelas do fechamento.
- **Mudança de schema:** escreva o SQL numa **migration nova** em `supabase/migrations/` e **acrescente o mesmo texto, sem alterar, como nova seção** no fim do `supabase/setup-completo.sql` (o teste `src/test/banco/` confere que a última migration está lá). **Quem roda é o usuário, manualmente, no SQL Editor do Supabase.** O assistente **nunca** tem acesso de execução ao banco. Atualize também `src/integrations/supabase/types.ts`, que é mantido à mão, e escreva testes em `src/test/banco/`.
- **Testes do banco** (`src/test/banco/`, Vitest + PGlite, ambiente node): rodam o `setup-completo.sql` num Postgres em memória que imita o Supabase (papéis `anon`/`authenticated`, privilégios padrão, `auth.uid()`). `supabaseSimulado.ts` tem os auxiliares: `fixarHoje` troca `hoje_sp()` por uma data fixa, `como(db, "authenticated", ...)` roda como a API. Toda função nova do banco precisa de teste aqui.
- **Testes com dado real:** use fichas descartáveis **997/998/999**, criadas no banco real e **excluídas logo depois**. Nunca altere fichas reais. O número da ficha vai no máximo até 999, então essa convenção quebra se a cantina chegar a usar esses números de verdade.
- **Nunca rode `git commit` nem `git push` sem pedido explícito.** O usuário faz os commits.
- **Nomenclatura:**
  - **Branches e mensagens de commit em inglês** (`feature/account-closing`, `feat: ...`, `fix: ...`).
  - **Código e banco em português**, seguindo o vocabulário do domínio que já existe: schema, tabelas, colunas, funções SQL, componentes, hooks, variáveis e arquivos. Exemplos: `fiadores`, `saldo_atual`, `registrar_pagamento`, `FichaDetalheDialog`, `useFichas`, `periodos_fechamento`.
  - **Não renomeie nada que já existe**, inclusive o que está em inglês (`ProtectedRoute`, `AuthContext`, `Login`, `NotFound`, `Index`, as chaves de view `dashboard` e `compra`).
  - **O que for novo segue o padrão português.**
  - **Exceções que ficam como estão:** convenções das ferramentas (prefixo `use` dos hooks React, componentes shadcn em `src/components/ui/`, sufixo `.test.ts`, nomes de variáveis `VITE_*`).
- **Depois de toda mudança, rode `npx tsc --noEmit -p tsconfig.app.json`.** O `npx tsc --noEmit` puro **não checa nada**: o `tsconfig.json` é um "solution" com `"files": []`, e o comando na raiz lista 0 arquivos de `src`. O projeto roda com `strict: false` e `strictNullChecks: false`, então um tsc limpo prova pouco. Verifique também no navegador.
- **Produção com dados reais:** qualquer operação destrutiva ou migration exige cuidado redobrado. Excluir uma ficha apaga em cascata as compras e os pagamentos dela, sem volta. Ficha com fechamento em aberto não pode ser excluída (trigger, erro `CF001`); os itens quitados ficam com número e nome congelados.
- **O repositório é PÚBLICO:** nenhum segredo, credencial ou dado de aluno no código, em migration, em comentário ou neste arquivo. O `.env` está no `.gitignore`. O `supabase/config.toml` e o `.claude/launch.json` são versionados, então não ponha nada sensível neles.
- **Verificação no Browser pane:** dialogs Radix podem continuar no DOM com `data-state="closed"` (artefato de animação da automação). Cheque `data-state` antes de achar que é bug e, se precisar, recarregue a página.

## Mapa das telas, dos arquivos e do banco

### Banco de dados

| Tabela | Colunas relevantes | Observações |
|---|---|---|
| `fiadores` (fichas) | `numero_ficha` (TEXT UNIQUE), `nome_aluno`, `nome_responsavel` (NOT NULL), `tipo` (`dependente`/`independente`), `resp1_celular`, `resp1_cpf`, `resp2_nome`, `resp2_celular`, `resp2_cpf`, `saldo_atual` NUMERIC(10,2), `bloqueada`, `somente_credito`, `observacoes` (= "anotação"), `status` (legado, CHECK `ativo`/`inativo`), `telefone` (legado, sem uso), `created_at`, `updated_at` (via trigger) | O formato de 3 dígitos e a obrigatoriedade do celular são validados **só no front**. No banco, `resp1_celular` aceita NULL. |
| `compras` | `fiador_id`, `descricao`, `valor` (>0), `data`, `mes_referencia` (`YYYY-MM`, só rótulo), `fechado` (legado, sem uso) | FK com ON DELETE CASCADE |
| `pagamentos` | `fiador_id`, `valor` (>0), `observacao`, `data` | Não é vinculado a nenhuma compra: só abate do saldo corrente. |
| `configuracao` | `dia_fechamento` (1–31, padrão 6) | Uma linha só. Muda só por `definir_dia_fechamento`. |
| `configuracao_historico` | `dia_anterior`, `dia_novo`, `transicao_inicio`/`transicao_fim`, `aviso_confirmado`, `alterado_por` | Auditoria das trocas de dia. |
| `periodos_fechamento` | `data_inicio`, `data_fim` (inclusiva), `dia_ancora`, `transicao`, `periodo_anterior_id`, `fechado_em` | Cadeia linear sem buraco nem sobreposição (UNIQUE, EXCLUDE e trigger `periodo_encadeado`). |
| `fechamento_itens` | `periodo_id`, `fiador_id` (SET NULL), `numero_ficha` e `nome_aluno` congelados, `saldo_congelado` (>0), `quitado_em`, `quitado_por_pagamento_id` | Um por ficha devedora no corte. |
| `periodo_divergencias` | `periodo_id`, ficha congelada, `saldo_atual`, `saldo_razao` | Divergências razão × saldo aceitas num fechamento. |

- **View `v_atraso_fichas`** (`fiador_id`, `desde`, `atraso`): períodos fechados desde o item aberto mais antigo da ficha.
- **Regras do fechamento** (detalhes em `docs/plano-fechamento.md`): período do dia-âncora N até a véspera do N seguinte (mês curto usa o último dia); corte = dia seguinte ao fim, 00:00 de São Paulo; saldo congelado = razão (Σ compras − Σ pagamentos) antes do corte; item nasce quitado se o razão chegou a ≤ 0 depois do corte; pagamento que deixa `saldo_atual` ≤ 0 quita todos os itens abertos da ficha.
- **Permissões** (todas as policies são `TO authenticated USING (true)`, sem escopo por usuário):
  - `fiadores`: SELECT e DELETE; INSERT e UPDATE **só nas colunas que o app usa** (nunca `saldo_atual`, `status`, `telefone`).
  - `compras`, `pagamentos` e as tabelas do fechamento: **só SELECT**. Escrita só pelas RPCs.
  - `anon` não executa nenhuma função.
- **RPCs de escrita** (`SECURITY DEFINER`, `search_path` fixo, erros com códigos `CF0xx` listados no topo da migration):
  - `registrar_compra(p_fiador_id, p_descricao, p_valor, p_mes_referencia)`: trava a ficha, faz `saldo += valor` e insere a compra. **Não** checa `bloqueada` nem `somente_credito`; essas travas existem só na UI.
  - `registrar_pagamento(p_fiador_id, p_valor, p_observacao)`: faz `saldo -= valor`, insere o pagamento e, se o saldo ficou ≤ 0, quita os itens abertos.
  - `fechar_periodo(p_data_inicio, p_divergencias_confirmadas)`: fecha o período pendente mais antigo; trava todas as fichas (desiste em 3 s); recusa (`CF002`) se a divergência atual não for igual à confirmada.
  - `definir_dia_fechamento(p_dia, p_confirmar_aviso)`: troca o dia; bloqueada com pendente ou transição aberta.
- **Funções de leitura:** `proximos_periodos()` (pendentes + o em andamento), `previa_fechamento()`, `verificar_divergencias()`, `simular_troca_dia(p_dia)`, `transicao_aberta()`, `hoje_sp()`, `periodo_de(data, dia)`.

### Telas e arquivos

- `src/App.tsx`: rotas `/login`, `/` (Index, dentro do `ProtectedRoute`) e `*`.
- `src/pages/Login.tsx`: o usuário digitado vira `<usuario>@cantina.local`, com senha do Supabase Auth.
- `src/contexts/AuthContext.tsx` + `src/components/ProtectedRoute.tsx`: o **login está desligado**. O `ProtectedRoute` retorna `children` antes de qualquer checagem, e o `AuthContext` faz login automático com `VITE_DEV_ADMIN_*` sempre que não há sessão. Isso **não** depende de `import.meta.env.DEV`. E, como a produção é o próprio `npm run dev` (ver "Produção"), as credenciais vão no JavaScript servido a qualquer navegador que abra o app.
- `src/config/cantina.ts`: nome e proprietário exibidos no header e no login. É o ponto de entrada futuro para multi-tenant.
- `src/components/EstadoContaBadge.tsx`: o badge Ativo/Bloqueada, único para a lista de Fichas (`contexto="lista"`), o título do detalhe (`"titulo"`) e o seletor da Nova Venda (`"seletor"`, só aparece se bloqueada, em âmbar). Mudou o visual do estado da conta? Mude só aqui.
- `src/lib/saldo.ts` (`formatSaldo`) e `src/lib/masks.ts`: máscaras, `isCpfValido` (só conta 11 dígitos, **sem** dígito verificador) e `isTelefoneValido` (10 ou 11 dígitos; campo vazio é considerado válido).
- Hooks em `src/hooks/`:
  - `useFichas.ts`: CRUD de fichas e `useRegistrarCompra`.
  - `usePagamentos.ts`: `useRegistrarPagamento` e `useExtrato`.
  - (`useFechamentos.ts` foi removido na etapa 1; os hooks do fechamento novo voltam na etapa 2c.)
  - `useVendas.ts`: busca **todas** as compras.
  - `useFaturamento.ts`: soma das compras do dia local.
- **`src/pages/Index.tsx`** orquestra tudo pelo state `view`. A nav segue esta ordem:
  - **Menu** (`menu`, default):
    - Card "Faturamento do dia": soma das **vendas** do dia, não do dinheiro recebido. O valor é ocultável e volta a ficar oculto toda vez que a aba reabre.
    - Card com a data de hoje.
    - 5 atalhos: Realizar uma nova venda, Cadastrar nova ficha (abre a aba Fichas com o modal aberto), e três mocks com toast: Verificar devedores, Gerar relatório e Cadastrar produto.
  - **Fichas** (`fichas`):
    - Lista com número, nome, anotação truncada com ícone, responsável (só para dependente), saldo e badge verde **Ativo** / vermelho **Bloqueada** (derivado de `bloqueada`).
    - A busca é por substring no número, no nome e no responsável. O state `search` é **compartilhado** com o Controle.
    - Modal "Nova Ficha": número só com dígitos, `maxLength=3`, completado com zeros, placeholder "Próx Num Livre: XXX" (o menor número livre). Switch Dependente/Independente. Validação de celular e CPF. Uma conta independente grava `nome_responsavel = "O Mesmo"`; fichas antigas podem ter `"O Próprio"`.
  - **Vendas** (`compra`; o título da tela é "Últimas Vendas"):
    - Mostra as 70 compras mais recentes. O corte é **só na renderização**: o hook busca a tabela inteira.
    - Clicar numa venda abre o detalhe da ficha.
    - Switch "Modo recreio": depois de cada venda, o modal volta para a busca em vez de fechar. O state vale para o modal em qualquer origem e não persiste ao recarregar.
    - Botão "Realizar Nova Venda".
  - **Relatórios** (`relatorios`):
    - Cards "Fichas com Saldo Pendente" (saldo > 0) e "Total Geral a Receber". Os dois têm cursor de clique, mas não fazem nada.
    - Card "Exportar Relatório": sem ação nenhuma, nem toast.
    - A seção "Fechamento Mensal" saiu na etapa 1. O fechamento por período ganha aba própria na etapa 2d.
  - **Controle** (`dashboard`):
    - Cards Total a Receber, Fichas Ativas (`!bloqueada`) e "+ Nova Venda".
    - Busca Rápida: o clique abre a **Nova Venda** já com a ficha selecionada.
    - Top 3 maiores saldos.
- **`src/components/FichaDetalheDialog.tsx`** (detalhe da conta):
  - Header: `#número`, nome e badge.
  - Div cinza 1: saldo e os botões Editar/Cancelar, Trancar/Destrancar Conta (com confirmação) e Anotação (toggle).
  - Div cinza 2: checkbox "Disponibilizar SOMENTE valor Pré-Pago" (sem confirmação) e, à direita, responsável e celular. O Responsável 2 aparece com uma linha divisória quando há `resp2_nome`.
  - Anotação: textarea que salva sozinho no blur, na coluna `observacoes`.
  - Modo Editar: nome, responsável (só para dependente), celular, CPF e os campos do Responsável 2 (aparecem **também para independente**). Botão Excluir Ficha com confirmação. Não dá para mudar `tipo` nem `numero_ficha`.
  - Registrar Pagamento: valor > 0 e observação opcional.
  - Extrato: compras e pagamentos, só com data, do mais recente para o mais antigo.
- **`src/components/NovaVendaDialog.tsx`** (aberto pelo Menu, pela aba Vendas, pelo Controle e pela **barra de espaço** em qualquer lugar fora de inputs e de modais):
  - **Etapa 1:** busca por número ou nome. Digitar um número e dar **Enter** seleciona a ficha pelo número exato completado com zeros (`1` ou `01` viram `001`); se não existir, mostra um toast. A lista mostra o badge "Bloqueada" em **âmbar** (token `warning`) e não mostra a anotação.
  - **Etapa 2:** card com saldo, anotação em âmbar e botão "Trocar".
    - Conta bloqueada: aparece um aviso e a venda fica impedida.
    - `somente_credito`: mostra o crédito disponível e bloqueia se o valor passar dele.
    - Descrição vazia vira "Valor Avulso".
    - O campo Valor recebe foco automático e **Enter registra a venda**.

## Decisões de design já fechadas (não reabrir)

- **Ativar/Desativar ficha foi removido.** O estado de conta é só `bloqueada` (Trancar/Destrancar), que impede vendas novas mas permite pagamentos. A coluna `status` ficou no banco e nada a lê nem escreve (o fechamento novo inclui toda ficha devedora, bloqueada ou não).
- **Cores:** verde (`success`) = Ativo/OK e crédito; vermelho (`destructive`) = Bloqueada e dívida; âmbar (`warning`) = avisos (trancar, anotação na venda, somente-crédito, bloqueada no seletor de venda). O laranja do app é o `primary`, não o `warning`.
- **Saldo corrente:** o pagamento abate o total da ficha e não quita uma compra específica. No fechamento, um item só é quitado quando o saldo da ficha chega a ≤ 0 (não existe quitação parcial).
- **Anotação:** aparece na lista de Fichas e na etapa 2 da venda, mas **não** no seletor da etapa 1.
- **Conta independente:** não exibe a linha "Responsável" em lugar nenhum.
- **Mutações de saldo:** sempre via RPC, e testes sempre com as fichas 997/998/999.

## Dívida técnica conhecida

- **Segurança/produção:** o caixa roda com o login desligado e o Vite escuta em todas as interfaces (`host: "::"`).
  - Qualquer pessoa numa rede que alcance esta máquina (Wi-Fi, hotspot, VPN) e abra `http://<ip>:8080` entra direto com sessão de admin.
  - A senha do admin (`VITE_DEV_ADMIN_PASSWORD`) vai no JS servido a esse navegador.
  - A senha antiga continua nos commits antigos do repo público. O que a neutraliza é a rotação que já foi feita.
- **Fechamento ainda sem tela:** o banco já tem o fechamento por período (etapa 1), mas a aba Fechamento, o atraso nas telas e a tela de Configurações só chegam nas etapas 2a–2f.
- **Fuso horário:** `mes_referencia` usa `toISOString()` (UTC), então uma venda depois das 21h do último dia do mês ganha o rótulo do mês seguinte. É só rótulo: o fechamento usa `data` no fuso de São Paulo. O faturamento do dia usa o dia local.
- **Não há estorno nem correção pela UI:** não existe como excluir ou editar uma venda ou um pagamento, e nem a API permite (só as RPCs escrevem no razão). Correção é manual, via SQL Editor, mantendo razão e saldo iguais.
- **Travas só no client:** `bloqueada` e `somente_credito` não são validadas nas RPCs. O teste de crédito usa um snapshot da ficha selecionada.
- **Enter duplo no campo Valor** pode registrar duas vendas, porque o handler do Enter não checa `isPending`. Também não há validação `valor > 0` no client da venda; quem recusa é o banco.
- **"Total a Receber"** (Controle e Relatórios) é a soma **líquida** de `saldo_atual`: créditos abatem do total. O valor também não usa `formatSaldo`.
- **"Maiores Saldos Pendentes"** pode listar fichas zeradas ou com crédito, em vermelho, quando há menos de 3 devedores.
- **Performance:** `useVendas` traz todas as compras, sujeito ao limite padrão de linhas do PostgREST, a cada venda.
- **Formulários:** o modo Editar não valida nome vazio e mostra Responsável 2 para conta independente. O "Cancelar" da Nova Ficha não limpa o formulário.
- **Atalho de espaço:** dispara mesmo com foco num botão ou switch, roubando o clique.
- **Mocks e placeholders:** Verificar devedores, Gerar relatório, Cadastrar produto e Exportar Relatório.
- **Sem multi-tenant:** a RLS não tem escopo por usuário ou cantina.
- **Dívida de docs e projeto:** o `README.md` está desatualizado (diz que o `.env` já vem com as credenciais), `NavLink.tsx` e `App.css` são código morto, só a validação do ambiente e o SQL têm testes (as telas não) e o TypeScript roda em modo não estrito.
