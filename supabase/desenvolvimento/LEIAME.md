# Banco de desenvolvimento — scripts

O sistema **ainda não está em uso**: o banco do `.env` (projeto `yqhiazfknioaxlyzobrz`) só tem dados de teste. É o **único ambiente**. Serve para desenvolver e testar e, na entrada em uso, é limpo e vira o banco real.

Todos os scripts rodam no **SQL Editor do Supabase**, por você.

| Arquivo | Quando rodar | O que faz |
|---|---|---|
| `00-marcador.sql` | Uma vez, agora | Marca o banco como `desenvolvimento`. Sem a marca, seed e reset recusam rodar. |
| `seed.sql` | Sempre que quiser voltar ao estado de teste | Apaga tudo e cria as fichas 901–908, com datas relativas a hoje. Mostra no fim os períodos P1–P4 calculados. |
| `reset.sql` | Para só apagar | Apaga os dados de todas as tabelas do app e mantém a marca. |
| `carga.sql` | Depois do seed, para testar volume | Completa as fichas até 999 e cria ~45 mil compras e ~5 mil pagamentos, sem divergência. Desfaz com o seed. |
| `medir-fechamento.sql` | Depois da carga | Fecha o próximo período dentro de uma transação, mostra quanto tempo levou (ms) e desfaz tudo. |
| `entrada-em-uso.sql` | **Uma vez, no dia em que o sistema entrar em uso** | Apaga os dados de teste, remove a marca e cria `_em_uso`. Exige editar uma linha de confirmação. |

## Primeira vez

1. Rode `00-marcador.sql`.
2. Rode `seed.sql`. As 9 fichas de teste antigas (#001–#009) são apagadas e substituídas pelas 901–908.
3. Abra o app com `npm run dev` e confira as fichas.

## Fichas do seed

| Ficha | Situação | Resultado esperado (depois do fechamento) |
|---|---|---|
| 901 | Compra só no período corrente | Sem atraso |
| 902 | Bloqueada, sem dívida antiga | Badge sólido, sem atraso |
| 903 | Compra em P4 não paga | Atraso 1 |
| 904 | Compra em P3 não paga | Atraso 2 |
| 905 | Compra em P1 não paga | Atraso 3+ |
| 906 | Igual à 905, porém bloqueada | Pior caso visual |
| 907 | Compra em P3 não paga, com anotação | Anotação + atraso na Nova Venda |
| 908 | Compra em P1, pagamento que zera em P2, compra em P3 | Item de P1 nasce quitado; P3 em aberto (atraso 2) |

O seed não fecha nenhum período: os 4 pendentes são fechados pelo botão, um por clique.

## Proteções

- Seed e reset **recusam** sem a marca `desenvolvimento` e recusam **para sempre** depois que o `entrada-em-uso.sql` rodar.
- O `00-marcador.sql` também recusa depois da entrada em uso.
- As tabelas `_ambiente` e `_em_uso` são invisíveis para o app (RLS ligada, sem permissão para `anon` e `authenticated`).
