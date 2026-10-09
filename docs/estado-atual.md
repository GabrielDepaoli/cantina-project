# Estado atual — Fechamento de Contas

Atualizado em 09/10/2026. Plano completo: [`docs/plano-fechamento.md`](plano-fechamento.md) (v5).

## Etapa concluída

- **S — Staging e separação de ambientes**: código pronto e verificado.
  - Inclui `src/config/ambiente.ts`, a tela de erro, a faixa e a etiqueta de ambiente, `npm run dev:staging` e os scripts de `supabase/staging/` (marcador, seed e reset, testados num Postgres local).
  - **Pendente:** você criar o projeto `cantina-staging` no Supabase, seguindo `supabase/staging/LEIAME.md`.

## Próxima etapa

- **B — Primeiro backup de produção e teste de restauração em staging.** Depende do staging criado. Roteiro na seção "Backup e restauração" do plano. Ela só começa quando você pedir.

## Git

- **Branch atual:** `feature/account-closing`. É também a branch que o caixa roda se o `npm run dev` for iniciado nesta pasta.
- **Último commit:** `a8b162a fix: accept any URL supabase-js accepts and document naming convention`.
- **Pendente de push:**
  - `a8b162a`: a branch local está 1 commit à frente de `origin/feature/account-closing`. O `1c71208` já está no remoto.
  - Nenhum dos dois commits está na `main`, porque a branch não foi mergeada.
- **Pendente de commit:**
  - `CLAUDE.md`: seção "Produção: é ESTA máquina".
  - `docs/plano-fechamento.md` e `docs/estado-atual.md` (novos).

## Decisões em aberto

1. **Pasta de desenvolvimento separada** (`git worktree`): o HMR leva edições desta pasta direto ao caixa.
2. **Exposição na rede:** `host: "::"` com o login desligado.
3. **Textos de "hospedagem" e "deploy"** no código: ajustar para `.env` local e reiniciar o `npm run dev`?
