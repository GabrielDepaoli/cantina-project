import { cn } from "@/lib/utils";

// Badge do estado da conta (Ativo / Bloqueada), usado na lista de Fichas, no
// título do detalhe e no seletor da Nova Venda. O estado vem só de `bloqueada`.
//   lista   → verde "Ativo" ou vermelho "Bloqueada"
//   titulo  → igual à lista, com peso normal (fica dentro do título em negrito)
//   seletor → só aparece quando bloqueada, em âmbar
interface EstadoContaBadgeProps {
  bloqueada: boolean;
  contexto?: "lista" | "titulo" | "seletor";
}

const EstadoContaBadge = ({ bloqueada, contexto = "lista" }: EstadoContaBadgeProps) => {
  if (contexto === "seletor") {
    if (!bloqueada) return null;
    return <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning shrink-0">Bloqueada</span>;
  }

  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded-full",
        contexto === "titulo" && "font-normal",
        !bloqueada ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
      )}
    >
      {!bloqueada ? "Ativo" : "Bloqueada"}
    </span>
  );
};

export default EstadoContaBadge;
