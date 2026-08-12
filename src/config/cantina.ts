// Configuração da cantina exibida na tela (header e login).
//
// Por enquanto é fixo aqui. Quando o sistema passar a suportar várias
// cantinas/contas (multi-tenant), troque isto por um hook que busca esses
// dados do Supabase a partir do usuário logado (ex: tabela `cantinas` com
// nome/proprietário por conta) — o resto do app não muda, só a origem
// desses dois valores.
export const cantinaConfig = {
  nome: "Restaurante e Cantina Depaoli",
  proprietario: "Juarez Depaoli",
};
