# Cantina Fiado

Sistema de gerenciamento de fichas e fiado para cantina escolar: cadastro de fichas (alunos/responsáveis ou independentes), registro de compras, controle de saldo devedor, fechamentos mensais e relatórios.

## Tecnologias

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Supabase (banco de dados e autenticação)

## Como rodar localmente

Pré-requisito: Node.js instalado ([instalar com nvm](https://github.com/nvm-sh/nvm#installing-and-updating)).

```sh
# Instalar as dependências
npm install

# Subir o servidor de desenvolvimento (hot-reload)
npm run dev
```

O app fica disponível em `http://localhost:8080`.

### Variáveis de ambiente

O arquivo `.env` já contém as credenciais do projeto Supabase (`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`).

## Scripts disponíveis

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — build de produção
- `npm run preview` — pré-visualiza o build de produção
- `npm run lint` — checagem de lint
- `npm run test` — roda os testes
