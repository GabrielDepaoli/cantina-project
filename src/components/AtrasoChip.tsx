import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// Atraso no fechamento: quantos períodos fechados desde o item em aberto mais
// antigo da ficha (view v_atraso_fichas). 1 = amarelo, 2 = laranja, 3+ = vermelho.
// O número vai sempre escrito, para não depender só da cor. Atraso não bloqueia
// venda; o estado da conta continua no EstadoContaBadge (sólido).

export type NivelAtraso = 1 | 2 | 3;

export const nivelAtraso = (atraso: number | null | undefined): NivelAtraso | null =>
  !atraso || atraso < 1 ? null : atraso >= 3 ? 3 : (atraso as 1 | 2);

export const textoAtraso = (atraso: number) => `${atraso} ${atraso === 1 ? "período" : "períodos"} em atraso`;

// Classes completas (o Tailwind só gera classes escritas por inteiro).
const CLASSES_CHIP: Record<NivelAtraso, string> = {
  1: "bg-atraso-1/10 border-atraso-1/40 text-atraso-1-texto",
  2: "bg-atraso-2/10 border-atraso-2/40 text-atraso-2-texto",
  3: "bg-atraso-3/10 border-atraso-3/40 text-atraso-3-texto",
};

const CLASSES_LINHA: Record<NivelAtraso, string> = {
  1: "border-l-4 border-l-atraso-1 bg-atraso-1/5",
  2: "border-l-4 border-l-atraso-2 bg-atraso-2/5",
  3: "border-l-4 border-l-atraso-3 bg-atraso-3/5",
};

// Faixa lateral de 4px + fundo bem suave, para a linha da lista de Fichas.
// Vazio quando não há atraso.
export const classeLinhaAtraso = (atraso: number | null | undefined) => {
  const nivel = nivelAtraso(atraso);
  return nivel ? CLASSES_LINHA[nivel] : "";
};

interface AtrasoChipProps {
  atraso: number | null | undefined;
  className?: string;
}

const AtrasoChip = ({ atraso, className }: AtrasoChipProps) => {
  const nivel = nivelAtraso(atraso);
  if (!nivel) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md border shrink-0",
        CLASSES_CHIP[nivel],
        className,
      )}
    >
      <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
      {textoAtraso(atraso)}
    </span>
  );
};

export default AtrasoChip;
