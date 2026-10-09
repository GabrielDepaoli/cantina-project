# Staging — banco de testes

Fechamento de contas, dashboard e endurecimento de RLS **se testam aqui, nunca em produção**. As fichas 997–999 continuam valendo só para alterações pontuais em produção.

## Criar o projeto (uma vez)

1. **Criar o projeto.** No painel do Supabase, *New project*, com o nome `cantina-staging`, na mesma região do projeto de produção.
   - Guarde a senha do banco no seu gerenciador de senhas, **nunca** no repositório.
2. **Montar o schema.** No SQL Editor **do projeto de staging**, rode, nesta ordem:
   1. `supabase/setup-completo.sql`;
   2. `supabase/staging/00-marcador.sql`. Ele marca o banco como staging e recusa rodar num banco que já tenha fichas.
3. **Autenticação de staging.**
   - Em *Authentication → Sign In / Providers*, **desligue** "Allow new users to sign up".
   - Em *Authentication → Users → Add user*, crie `admin@cantina.local` com uma senha **diferente** da de produção.
4. **Arquivo de ambiente local.**
   - Em *Settings → API*, copie a Project URL e a chave `anon`/publishable.
   - Na raiz do projeto, crie `.env.staging.local`. Ele já é ignorado pelo git (`*.local`).

   ```
   VITE_SUPABASE_URL="https://<ref-de-staging>.supabase.co"
   VITE_SUPABASE_PUBLISHABLE_KEY="<chave de staging>"
   VITE_SUPABASE_PROJECT_ID="<ref-de-staging>"
   VITE_DEV_ADMIN_EMAIL="admin@cantina.local"
   VITE_DEV_ADMIN_PASSWORD="<senha de staging>"
   ```

   **Preencha as cinco variáveis.** O que faltar nele é herdado do `.env` de produção.
5. **Dados de teste.** No SQL Editor de staging, rode `supabase/staging/seed.sql`. Ele mostra no fim os períodos P1–P4 calculados para hoje e as fichas 901–908.

## Usar

| Comando | Banco | Como saber na tela |
|---|---|---|
| `npm run dev` | **Produção** (`.env`) | Etiqueta discreta "Produção" ao lado do nome da cantina |
| `npm run dev:staging` | **Staging** (`.env.staging.local`) | Faixa amarela "STAGING" no topo, etiqueta "STAGING" no header e `[STAGING]` no título da aba |

**O `.env` de produção nunca é editado para usar staging.**

Se a configuração estiver errada, o app **não abre**: mostra uma tela de erro explicando o problema. Isso acontece, por exemplo, quando:
- o modo staging aponta para a URL de produção;
- o `VITE_SUPABASE_PROJECT_ID` não bate com a URL;
- falta a URL ou a chave;
- a URL tem caminho.

## Voltar ao estado inicial

- **Caminho normal:** rodar `seed.sql` de novo. Ele já começa apagando tudo e recria as mesmas fichas, com datas relativas a hoje.
- **Só apagar:** rodar `reset.sql`. Ele apaga os dados de todas as tabelas do app e mantém o marcador.
- **Se o schema de staging quebrar:** apagar o projeto de staging e refazer "Criar o projeto". Leva uns 5 minutos.

Os dois scripts **recusam rodar** em qualquer banco sem a marca de staging. Em produção, eles abortam sem tocar em nada.

## Dados reais em staging

A cópia de produção só entra em staging durante o **teste de restauração de backup**, e segue um roteiro numa única sessão:

1. **Antes de restaurar:** confirmar que o signup está desligado e que só existe o usuário admin de staging.
2. **Restaurar** e conferir a contagem.
3. Fazer o **ensaio da migration**, se houver.
4. Rodar **`reset.sql` + `seed.sql` imediatamente**.
5. Conferir com `SELECT numero_ficha FROM fiadores ORDER BY 1;`. O resultado deve ser **só 901–908**.

A cópia real **nunca fica parada** em staging. Se a sessão for interrompida, a primeira ação da próxima é o passo 4.

Se o marcador `_ambiente` sumir depois de uma restauração, o reset deixa de funcionar e o `00-marcador.sql` também recusa, porque o banco terá fichas. Nesse caso, apague e recrie o projeto de staging.
