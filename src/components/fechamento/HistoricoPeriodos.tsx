import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { PeriodoComItens } from "@/hooks/useFechamentos";
import { dataSp, intervalo } from "@/lib/datas";
import { formatSaldo } from "@/lib/saldo";
import SeloTransicao from "./SeloTransicao";

// Períodos já fechados, do mais recente para o mais antigo. Cada ficha mostra
// o valor congelado no fechamento e se já foi quitada (e quando).
interface HistoricoPeriodosProps {
  periodos: PeriodoComItens[];
}

const HistoricoPeriodos = ({ periodos }: HistoricoPeriodosProps) => {
  if (periodos.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">Nenhum período fechado ainda.</p>;
  }

  return (
    <Accordion type="multiple" className="space-y-2">
      {periodos.map((p) => {
        const itens = [...p.fechamento_itens].sort((a, b) => a.numero_ficha.localeCompare(b.numero_ficha));
        const total = itens.reduce((s, i) => s + Number(i.saldo_congelado), 0);
        const abertos = itens.filter((i) => !i.quitado_em).length;
        return (
          <AccordionItem key={p.id} value={p.id} className="rounded-lg border border-border px-3">
            <AccordionTrigger className="hover:no-underline py-3">
              <div className="flex flex-col items-start gap-1 text-left">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  {intervalo(p.data_inicio, p.data_fim, true)} {p.transicao && <SeloTransicao />}
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  {itens.length === 0
                    ? "Sem fichas devendo"
                    : `${itens.length} ficha(s) · R$ ${total.toFixed(2)} congelado · ${abertos === 0 ? "todas quitadas" : `${abertos} em aberto`}`}
                  {p.periodo_divergencias.length > 0 && ` · ${p.periodo_divergencias.length} divergência(s) aceita(s)`}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pb-3">
              {itens.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 text-sm p-2 rounded bg-muted/30">
                  <span className="min-w-0 truncate">
                    <span className="font-mono font-bold text-primary mr-2">#{i.numero_ficha}</span>
                    {i.nome_aluno}
                    {!i.fiador_id && <span className="text-xs text-muted-foreground"> (ficha excluída)</span>}
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-muted-foreground text-xs">no fechamento: {formatSaldo(Number(i.saldo_congelado))}</span>
                    {i.quitado_em ? (
                      <span className="text-success text-xs font-medium">quitado em {dataSp(i.quitado_em)}</span>
                    ) : (
                      <span className="text-destructive text-xs font-medium">em aberto</span>
                    )}
                  </span>
                </div>
              ))}
              {p.periodo_divergencias.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1 pt-1">
                  <p className="font-medium text-foreground">Divergências aceitas neste fechamento:</p>
                  {p.periodo_divergencias.map((d) => (
                    <p key={d.id}>
                      #{d.numero_ficha} {d.nome_aluno}: saldo gravado {formatSaldo(Number(d.saldo_atual))}, pelos lançamentos{" "}
                      {formatSaldo(Number(d.saldo_razao))}
                    </p>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Fechado em {dataSp(p.fechado_em)}.</p>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
};

export default HistoricoPeriodos;
