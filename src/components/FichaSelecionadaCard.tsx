import { StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import AtrasoChip from "@/components/AtrasoChip";
import type { Ficha } from "@/hooks/useFichas";
import { formatSaldo } from "@/lib/saldo";

// Card da ficha escolhida na etapa 2 da Nova Venda: número, nome, saldo,
// atraso (chip com relógio, linha própria) e anotação (texto com nota).
// Formas e ícones diferentes separam atraso e anotação mesmo quando ambos
// são amarelos. O atraso não muda a borda do card nem bloqueia a venda.
interface FichaSelecionadaCardProps {
  ficha: Ficha;
  atraso?: number | null;
  onTrocar: () => void;
}

const FichaSelecionadaCard = ({ ficha, atraso, onTrocar }: FichaSelecionadaCardProps) => (
  <Card className={ficha.bloqueada ? "border-warning/30 bg-warning/5" : "border-primary/30 bg-primary/5"}>
    <CardContent className="p-4 flex items-center justify-between">
      <div>
        <p className="text-sm text-muted-foreground">Ficha selecionada</p>
        <p className="font-bold text-foreground text-lg">#{ficha.numero_ficha} — {ficha.nome_aluno}</p>
        <p className="text-sm text-muted-foreground">
          Saldo atual:{" "}
          <span className={`font-bold ${Number(ficha.saldo_atual) > 0 ? "text-destructive" : "text-success"}`}>
            {formatSaldo(Number(ficha.saldo_atual))}
          </span>
        </p>
        {atraso ? (
          <div className="mt-1">
            <AtrasoChip atraso={atraso} />
          </div>
        ) : null}
        {ficha.observacoes && (
          <p className="flex items-center gap-1 text-sm text-warning mt-1">
            <StickyNote className="w-3.5 h-3.5 shrink-0" /> {ficha.observacoes}
          </p>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={onTrocar}>Trocar</Button>
    </CardContent>
  </Card>
);

export default FichaSelecionadaCard;
