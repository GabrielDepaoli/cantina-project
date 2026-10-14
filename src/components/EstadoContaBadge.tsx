import { cn } from "@/lib/utils";

// Badge do estado da conta (Ativo / Bloqueada), usado na lista de Fichas, no
// título do detalhe e no seletor da Nova Venda. O estado vem só de `bloqueada`.
// Sólido (fundo cheio, texto branco) para não se confundir com o atraso, que
// usa chip claro com relógio e faixa lateral (ver AtrasoChip).
//   lista   → verde "Ativo" ou vermelho "Bloqueada"
//   titulo  → igual à lista, com peso próprio (fica dentro do título em negrito)
//   seletor → só aparece quando bloqueada
interface EstadoContaBadgeProps {
  bloqueada: boolean;
  contexto?: "lista" | "titulo" | "seletor";
}

const EstadoContaBadge = ({ bloqueada, contexto = "lista" }: EstadoContaBadgeProps) => {
  if (contexto === "seletor" && !bloqueada) return null;

  return (
    <span
      className={cn(
        "text-xs font-semibold px-2 py-0.5 rounded-full shrink-0",
        !bloqueada ? "bg-success-solido text-success-foreground" : "bg-destructive text-destructive-foreground",
      )}
    >
      {!bloqueada ? "Ativo" : "Bloqueada"}
    </span>
  );
};

export default EstadoContaBadge;
