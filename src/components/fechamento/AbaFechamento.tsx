import { useState, type ReactNode } from "react";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Ficha } from "@/hooks/useFichas";
import {
  useConfiguracao, useFichasEmAtraso, usePeriodos, useProximosPeriodos, type FichaEmAtraso,
} from "@/hooks/useFechamentos";
import { dataLonga, diaSeguinte, intervalo } from "@/lib/datas";
import DialogFecharPeriodo from "./DialogFecharPeriodo";
import HistoricoPeriodos from "./HistoricoPeriodos";
import LinhaFichaEmAberto from "./LinhaFichaEmAberto";
import SeloTransicao from "./SeloTransicao";

// Aba Fechamento: fecha os períodos pendentes (um por clique, do mais antigo),
// lista as fichas em aberto com o saldo ao vivo e mostra o histórico.
// Espaços reservados para recursos fora deste plano (sem botões de mentira):
//   extrasCabecalho → ações em lote no cabeçalho (ex.: cobrar todos)
//   indicadores     → cards do dashboard de inadimplência, entre o cabeçalho e as listas
//   acoesFicha      → ações por ficha na lista "Em aberto" (ex.: WhatsApp, extrato)
interface AbaFechamentoProps {
  onAbrirFicha: (ficha: Ficha) => void;
  extrasCabecalho?: ReactNode;
  indicadores?: ReactNode;
  acoesFicha?: (item: FichaEmAtraso) => ReactNode;
}

const AbaFechamento = ({ onAbrirFicha, extrasCabecalho, indicadores, acoesFicha }: AbaFechamentoProps) => {
  const { pendentes, emAndamento, isLoading: carregandoPeriodos } = useProximosPeriodos();
  const { data: emAtraso, isLoading: carregandoAtrasos } = useFichasEmAtraso();
  const { data: periodos = [], isLoading: carregandoHistorico } = usePeriodos();
  const { data: config } = useConfiguracao();
  const [confirmarOpen, setConfirmarOpen] = useState(false);

  const proximo = pendentes[0] ?? null;

  // Por que não há o que fechar (texto visível e no tooltip do botão).
  const motivoSemFechamento = emAndamento
    ? `Nada a fechar agora. O período ${intervalo(emAndamento.data_inicio, emAndamento.data_fim)} pode ser fechado a partir de ${dataLonga(diaSeguinte(emAndamento.data_fim))}.`
    : "Nenhuma compra registrada ainda, então não há período para fechar.";

  const botaoFechar = (
    <Button
      onClick={() => setConfirmarOpen(true)}
      disabled={!proximo}
      className="bg-primary text-primary-foreground hover:bg-primary/90"
    >
      <CalendarCheck className="w-4 h-4 mr-2" /> Fechar período…
    </Button>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-foreground">Fechamento</h2>

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 text-sm">
            {carregandoPeriodos ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : proximo ? (
              <p className="flex items-center gap-2 flex-wrap text-foreground">
                <span>
                  Próximo a fechar: <strong>{intervalo(proximo.data_inicio, proximo.data_fim, true)}</strong>
                </span>
                {proximo.transicao && <SeloTransicao />}
                <span className="text-muted-foreground">· {pendentes.length} pendente(s)</span>
              </p>
            ) : (
              <p className="text-muted-foreground">{motivoSemFechamento}</p>
            )}
            {config && (
              <p className="text-xs text-muted-foreground">
                Os períodos fecham todo dia {config.configuracao.dia_fechamento} (mês sem esse dia usa o último dia).
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {extrasCabecalho}
            {proximo ? (
              botaoFechar
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* span: botão desabilitado não dispara o tooltip */}
                  <span tabIndex={0}>{botaoFechar}</span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{motivoSemFechamento}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </CardContent>
      </Card>

      {indicadores}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Em aberto{emAtraso.length > 0 && ` (${emAtraso.length} ficha${emAtraso.length > 1 ? "s" : ""})`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {carregandoAtrasos ? (
            <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
          ) : emAtraso.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma ficha com fechamento em aberto.</p>
          ) : (
            emAtraso.map((item) => (
              <LinhaFichaEmAberto
                key={item.ficha.id}
                item={item}
                onAbrir={() => onAbrirFicha(item.ficha)}
                acoes={acoesFicha?.(item)}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          {carregandoHistorico ? (
            <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
          ) : (
            <HistoricoPeriodos periodos={periodos} />
          )}
        </CardContent>
      </Card>

      <DialogFecharPeriodo periodo={proximo} open={confirmarOpen} onOpenChange={setConfirmarOpen} />
    </div>
  );
};

export default AbaFechamento;
