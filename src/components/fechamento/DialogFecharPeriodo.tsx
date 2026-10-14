import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  useDivergencias, useFecharPeriodo, usePreviaFechamento, type PeriodoProximo,
} from "@/hooks/useFechamentos";
import { codigoErro, mensagemErro } from "@/lib/errosBanco";
import { intervalo } from "@/lib/datas";
import { formatSaldo } from "@/lib/saldo";
import SeloTransicao from "./SeloTransicao";

// Confirmação do fechamento do período pendente mais antigo. Mostra o que será
// congelado, as divergências razão × saldo (que exigem confirmação explícita)
// e o aviso de que vendas e pagamentos esperam durante o fechamento.
interface DialogFecharPeriodoProps {
  periodo: PeriodoProximo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DialogFecharPeriodo = ({ periodo, open, onOpenChange }: DialogFecharPeriodoProps) => {
  const { toast } = useToast();
  const { data: previa, isLoading: carregandoPrevia } = usePreviaFechamento(open);
  const { data: divergencias = [], isLoading: carregandoDivergencias, refetch: reconferir } = useDivergencias(open);
  const fecharPeriodo = useFecharPeriodo();
  const [confirmouDivergencias, setConfirmouDivergencias] = useState(false);

  // A confirmação vale só para a lista que está na tela.
  useEffect(() => {
    setConfirmouDivergencias(false);
  }, [open, divergencias]);

  if (!periodo) return null;

  const temDivergencia = divergencias.length > 0;
  const carregando = carregandoPrevia || carregandoDivergencias;
  const podeFechar = !carregando && !fecharPeriodo.isPending && (!temDivergencia || confirmouDivergencias);
  const nomePeriodo = intervalo(periodo.data_inicio, periodo.data_fim, true);

  const handleFechar = () => {
    fecharPeriodo.mutate(
      { dataInicio: periodo.data_inicio, divergenciasConfirmadas: divergencias },
      {
        onSuccess: () => {
          toast({
            title: `Período ${intervalo(periodo.data_inicio, periodo.data_fim)} fechado`,
            description: previa ? `${previa.fichas} ficha(s) com saldo devedor congelado.` : undefined,
          });
          onOpenChange(false);
        },
        onError: (erro) => {
          if (codigoErro(erro) === "CF002") {
            reconferir();
            toast({
              title: "A divergência mudou",
              description: "Algum saldo mudou desde que esta tela abriu. Confira a lista nova e confirme de novo.",
              variant: "destructive",
            });
            return;
          }
          toast({ title: "Erro", description: mensagemErro(erro, "Não foi possível fechar o período."), variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Fechar o período {nomePeriodo}? {periodo.transicao && <SeloTransicao />}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {carregando ? (
            <p className="text-muted-foreground">Calculando...</p>
          ) : (
            <p className="text-foreground">
              {previa && previa.fichas > 0 ? (
                <>
                  <strong>{previa.fichas} ficha(s)</strong> devendo no fim do período, somando{" "}
                  <strong>R$ {previa.total.toFixed(2)}</strong> de dívida. Esses valores ficam congelados no histórico;
                  cada ficha continua em aberto até o saldo dela chegar a zero.
                </>
              ) : (
                "Nenhuma ficha estava devendo no fim deste período. Ele será registrado sem itens."
              )}
            </p>
          )}

          {temDivergencia && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-3">
              <p className="flex items-center gap-2 font-semibold text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Saldo diferente do histórico de lançamentos
              </p>
              <p className="text-muted-foreground">
                Nestas fichas, o saldo gravado não bate com a soma das compras e pagamentos. O fechamento usa a soma
                dos lançamentos. A correção é manual, pelo SQL Editor, depois de um backup.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-2 font-medium">Ficha</th>
                      <th className="py-1 pr-2 font-medium">Saldo gravado</th>
                      <th className="py-1 font-medium">Pelos lançamentos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {divergencias.map((d) => (
                      <tr key={d.fiador_id} className="border-t border-border">
                        <td className="py-1 pr-2">#{d.numero_ficha} {d.nome_aluno}</td>
                        <td className="py-1 pr-2">{formatSaldo(d.saldo_atual)}</td>
                        <td className="py-1">{formatSaldo(d.saldo_razao)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="confirmar-divergencias"
                  checked={confirmouDivergencias}
                  onCheckedChange={(v) => setConfirmouDivergencias(v === true)}
                />
                <Label htmlFor="confirmar-divergencias" className="text-sm leading-snug">
                  Vi as divergências acima e quero fechar assim mesmo. Elas ficam registradas no período.
                </Label>
              </div>
            </div>
          )}

          <p className="text-muted-foreground">
            Durante o fechamento, vendas e pagamentos ficam aguardando por um instante. Prefira fechar fora do horário de
            movimento.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={fecharPeriodo.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleFechar} disabled={!podeFechar} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {fecharPeriodo.isPending ? "Fechando..." : "Fechar período"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DialogFecharPeriodo;
