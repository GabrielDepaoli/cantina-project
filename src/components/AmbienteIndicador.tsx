import { ambienteAtual } from "@/config/ambiente";

// Faixa no topo de todas as telas, só em staging, para nunca testar achando
// que é staging quando é produção (ou o contrário).
export const AmbienteBanner = () => {
  const ambiente = ambienteAtual();
  if (ambiente.tipo !== "staging") return null;

  return (
    <div role="status" className="bg-warning text-warning-foreground text-center text-sm font-semibold py-1.5 px-4">
      STAGING — banco de testes (projeto {ambiente.ref}). Nada feito aqui afeta a produção.
    </div>
  );
};

// Etiqueta no header, sempre visível (o header é fixo ao rolar a página).
export const AmbienteTag = () => {
  const ambiente = ambienteAtual();

  if (ambiente.tipo === "staging") {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-warning text-warning-foreground">
        Staging
      </span>
    );
  }

  return (
    <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded border border-border text-muted-foreground">
      Produção
    </span>
  );
};
