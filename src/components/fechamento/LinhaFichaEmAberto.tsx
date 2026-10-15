import type { ReactNode } from "react";
import AtrasoChip, { classeLinhaAtraso } from "@/components/AtrasoChip";
import EstadoContaBadge from "@/components/EstadoContaBadge";
import type { FichaEmAtraso } from "@/hooks/useFechamentos";
import { dataLonga } from "@/lib/datas";
import { formatSaldo } from "@/lib/saldo";
import { cn } from "@/lib/utils";

// Uma ficha com fechamento em aberto: saldo AO VIVO, atraso e estado da conta.
// `acoes` é o espaço reservado à direita para ações futuras por ficha
// (cobrar via WhatsApp, copiar extrato). Hoje fica vazio.
interface LinhaFichaEmAbertoProps {
  item: FichaEmAtraso;
  onAbrir: () => void;
  acoes?: ReactNode;
}

const LinhaFichaEmAberto = ({ item, onAbrir, acoes }: LinhaFichaEmAbertoProps) => {
  const { ficha, atraso, desde } = item;
  const saldo = Number(ficha.saldo_atual);

  return (
    <div className={cn("flex items-center gap-2 rounded-lg bg-muted/30", classeLinhaAtraso(atraso))}>
      <button
        onClick={onAbrir}
        className="flex-1 min-w-0 flex items-center justify-between gap-3 p-3 text-left rounded-lg hover:bg-muted/40 transition-colors"
      >
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-foreground truncate">
            <span className="font-mono font-bold text-primary mr-2">#{ficha.numero_ficha}</span>
            {ficha.nome_aluno}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <AtrasoChip atraso={atraso} />
            <span className="text-xs text-muted-foreground">em aberto desde o período de {dataLonga(desde)}</span>
          </div>
        </div>
        <div className="text-right shrink-0 space-y-1">
          <p className={`font-bold ${saldo > 0 ? "text-destructive" : "text-success"}`}>{formatSaldo(saldo)}</p>
          <EstadoContaBadge bloqueada={ficha.bloqueada} />
        </div>
      </button>
      {acoes && <div className="pr-3 shrink-0">{acoes}</div>}
    </div>
  );
};

export default LinhaFichaEmAberto;
