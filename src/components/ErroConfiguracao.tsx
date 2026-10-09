import type { ErroAmbiente } from "@/config/ambiente";

// Tela exibida no lugar do app quando a configuração do Supabase é inválida
// (ver src/config/ambiente.ts). Quem vê esta tela pode ser o operador do
// caixa: a parte de cima é para ele; os detalhes, para quem cuida do sistema.
// Não pode importar nada que toque no Supabase.
const ErroConfiguracao = ({ erros }: { erros: ErroAmbiente[] }) => (
  <div className="min-h-screen bg-background flex items-center justify-center p-4">
    <div className="w-full max-w-2xl rounded-lg border-2 border-destructive bg-card p-6 space-y-5">
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-destructive">O sistema não abriu por um problema de configuração</h1>
        <p className="text-base text-foreground">
          <strong>Nenhuma venda, pagamento ou ficha foi alterado.</strong> O sistema parou antes de acessar o banco de
          dados.
        </p>
        <p className="text-base text-foreground">
          <strong>O que fazer agora:</strong> não tente de novo. Avise a pessoa responsável pelo sistema e mostre esta
          tela (ou tire uma foto dela). Enquanto isso, anote as vendas no papel.
        </p>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Detalhes para quem cuida do sistema
        </p>
        {erros.map((erro, i) => (
          <div key={i} className="rounded-md bg-muted/40 p-3 space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Variável: </span>
              <code className="font-semibold text-foreground">{erro.variavel}</code>
            </p>
            <p>
              <span className="text-muted-foreground">Problema: </span>
              <span className="text-foreground">{erro.problema}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Como corrigir: </span>
              <span className="text-foreground">{erro.comoCorrigir}</span>
            </p>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Modelo das variáveis: <code>.env.example</code>. Staging: <code>supabase/staging/LEIAME.md</code>.
        </p>
      </div>
    </div>
  </div>
);

export default ErroConfiguracao;
