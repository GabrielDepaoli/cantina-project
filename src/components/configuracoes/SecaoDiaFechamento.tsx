import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useConfiguracao, useDefinirDia, useSimularTrocaDia, type SimulacaoTrocaDia } from "@/hooks/useFechamentos";
import { dataCurta, dataSp, diaSeguinte, intervalo } from "@/lib/datas";
import { mensagemErro } from "@/lib/errosBanco";

// Dia de fechamento (dia-âncora): troca com simulação da transição, bloqueios
// (período pendente ou transição anterior aberta) e histórico de trocas.
interface SecaoDiaFechamentoProps {
  onIrParaFechamento: () => void;
}

// Texto da transição que a troca vai gerar.
const textoSimulacao = (s: SimulacaoTrocaDia) => {
  if (s.mesmo_dia) return `O dia de fechamento já é ${s.dia_novo}.`;
  if (s.transicao_inicio && s.transicao_fim) {
    return `Período de transição de ${intervalo(s.transicao_inicio, s.transicao_fim, true)} (${s.dias} dia${s.dias === 1 ? "" : "s"}). Depois dele, os períodos vão do dia ${s.dia_novo} até a véspera do dia ${s.dia_novo} do mês seguinte.`;
  }
  return `Sem período de transição: os períodos passam a ir do dia ${s.dia_novo} até a véspera do dia ${s.dia_novo} do mês seguinte, contados a partir da primeira compra ou do último período fechado.`;
};

const SecaoDiaFechamento = ({ onIrParaFechamento }: SecaoDiaFechamentoProps) => {
  const { toast } = useToast();
  const { data: config, isLoading } = useConfiguracao();
  const diaAtual = config?.configuracao.dia_fechamento ?? null;

  // Bloqueios não dependem do dia escolhido: simula o próprio dia atual.
  const { data: estadoAtual } = useSimularTrocaDia(diaAtual);
  const [diaDigitado, setDiaDigitado] = useState("");
  const diaNovo = /^\d{1,2}$/.test(diaDigitado) ? Number(diaDigitado) : null;
  const diaValido = diaNovo !== null && diaNovo >= 1 && diaNovo <= 31;
  const { data: simulacao, isFetching: simulando } = useSimularTrocaDia(diaValido && diaNovo !== diaAtual ? diaNovo : null);

  const definirDia = useDefinirDia();
  const [confirmarOpen, setConfirmarOpen] = useState(false);
  const [aceitouAviso, setAceitouAviso] = useState(false);

  useEffect(() => {
    if (diaAtual !== null) setDiaDigitado(String(diaAtual));
  }, [diaAtual]);

  useEffect(() => {
    setAceitouAviso(false);
  }, [confirmarOpen, diaNovo]);

  const pendentes = estadoAtual?.pendentes ?? [];
  const transicaoAberta = estadoAtual?.transicao_aberta ?? null;
  const bloqueado = pendentes.length > 0 || transicaoAberta !== null;
  const podeSalvar = !bloqueado && diaValido && diaNovo !== diaAtual && !!simulacao && !simulando;

  const handleSalvar = () => {
    if (!diaNovo) return;
    definirDia.mutate(
      { dia: diaNovo, confirmarAviso: aceitouAviso },
      {
        onSuccess: () => {
          toast({ title: "Dia de fechamento alterado", description: `Os períodos agora fecham todo dia ${diaNovo}.` });
          setConfirmarOpen(false);
        },
        onError: (erro) => {
          toast({ title: "Erro", description: mensagemErro(erro, "Não foi possível trocar o dia de fechamento."), variant: "destructive" });
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Dia de fechamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isLoading || diaAtual === null ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : (
          <>
            <p className="text-foreground">
              Hoje os períodos fecham todo <strong>dia {diaAtual}</strong>: cada período vai do dia {diaAtual} até a
              véspera do dia {diaAtual} do mês seguinte. Em mês sem esse dia, vale o último dia do mês.
            </p>

            {pendentes.length > 0 && (
              <div className="rounded-md border border-warning/50 bg-warning/10 p-3 space-y-2">
                <p className="text-foreground">
                  Há {pendentes.length} período(s) encerrado(s) sem fechamento (
                  {pendentes.map((p) => intervalo(p.data_inicio, p.data_fim)).join(", ")}). Feche-os antes de trocar o dia.
                </p>
                <Button variant="outline" size="sm" onClick={onIrParaFechamento}>Ir para Fechamento</Button>
              </div>
            )}

            {pendentes.length === 0 && transicaoAberta && (
              <div className="rounded-md border border-warning/50 bg-warning/10 p-3 space-y-2">
                <p className="text-foreground">
                  A troca anterior (dia {transicaoAberta.dia_anterior} → {transicaoAberta.dia_novo}) gerou a transição{" "}
                  {intervalo(transicaoAberta.data_inicio, transicaoAberta.data_fim)}, que ainda não foi fechada. Feche-a
                  quando terminar (a partir de {dataCurta(diaSeguinte(transicaoAberta.data_fim))}) e então troque o dia.
                </p>
                <Button variant="outline" size="sm" onClick={onIrParaFechamento}>Ir para Fechamento</Button>
              </div>
            )}

            <div className="flex items-end gap-2 flex-wrap">
              <div className="space-y-1">
                <Label htmlFor="novo-dia">Novo dia (1 a 31)</Label>
                <Input
                  id="novo-dia"
                  inputMode="numeric"
                  maxLength={2}
                  value={diaDigitado}
                  onChange={(e) => setDiaDigitado(e.target.value.replace(/\D/g, ""))}
                  disabled={bloqueado}
                  className="w-24"
                />
              </div>
              <Button onClick={() => setConfirmarOpen(true)} disabled={!podeSalvar}>
                Trocar o dia…
              </Button>
            </div>

            {!bloqueado && diaDigitado !== "" && !diaValido && (
              <p className="text-destructive">Digite um dia entre 1 e 31.</p>
            )}
            {!bloqueado && simulacao && diaNovo !== diaAtual && (
              <p className="text-muted-foreground">{simulando ? "Calculando..." : textoSimulacao(simulacao)}</p>
            )}
          </>
        )}

        <div className="space-y-2 pt-2 border-t border-border">
          <p className="font-medium text-foreground pt-2">Histórico de trocas</p>
          {!config || config.historico.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma troca registrada.</p>
          ) : (
            <ul className="space-y-1">
              {config.historico.map((h) => (
                <li key={h.id} className="text-muted-foreground">
                  {dataSp(h.alterado_em)}: dia {h.dia_anterior} → {h.dia_novo}
                  {h.transicao_inicio && h.transicao_fim
                    ? ` · transição ${intervalo(h.transicao_inicio, h.transicao_fim)}${h.aviso_confirmado ? " (aviso de transição curta confirmado)" : ""}`
                    : " · sem transição"}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      <Dialog open={confirmarOpen} onOpenChange={setConfirmarOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trocar o dia de fechamento de {diaAtual} para {diaNovo}?</DialogTitle>
          </DialogHeader>
          {simulacao && (
            <div className="space-y-3 text-sm">
              <p className="text-foreground">{textoSimulacao(simulacao)}</p>
              <p className="text-muted-foreground">
                Os períodos já fechados, os valores congelados e as quitações não mudam.
              </p>
              {simulacao.aviso_curta && (
                <div className="rounded-md border border-warning/50 bg-warning/10 p-3 space-y-2">
                  <p className="flex items-center gap-2 font-semibold text-foreground">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-warning" /> Transição muito curta
                  </p>
                  <p className="text-foreground">
                    O período de transição terá só {simulacao.dias} dia(s). Ele vira um fechamento à parte, com as compras
                    desses poucos dias.
                  </p>
                  <div className="flex items-start gap-2">
                    <Checkbox id="aceitar-aviso" checked={aceitouAviso} onCheckedChange={(v) => setAceitouAviso(v === true)} />
                    <Label htmlFor="aceitar-aviso" className="leading-snug">Entendi e quero trocar assim mesmo.</Label>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmarOpen(false)} disabled={definirDia.isPending}>Cancelar</Button>
            <Button
              onClick={handleSalvar}
              disabled={definirDia.isPending || (simulacao?.aviso_curta && !aceitouAviso)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {definirDia.isPending ? "Salvando..." : "Trocar o dia"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default SecaoDiaFechamento;
