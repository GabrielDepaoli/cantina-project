import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFichas } from "@/hooks/useFichas";
import { useDivergencias, usePeriodos } from "@/hooks/useFechamentos";
import { horaSp, intervalo } from "@/lib/datas";
import { formatSaldo } from "@/lib/saldo";

// Conferência avulsa razão × saldo: só leitura, nunca corrige nada.
// Diferença = saldo gravado − saldo pelos lançamentos, em valor bruto com sinal.
const diferenca = (valor: number) =>
  `${valor > 0 ? "+" : valor < 0 ? "−" : ""}R$ ${Math.abs(valor).toFixed(2)}`;

const SecaoIntegridade = () => {
  const { data: fichas = [] } = useFichas();
  const { data: divergencias, isFetching, dataUpdatedAt, refetch, isError } = useDivergencias(false);
  const { data: periodos = [] } = usePeriodos();
  const comDivergenciaAceita = periodos.filter((p) => p.periodo_divergencias.length > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Integridade do razão</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Confere, ficha a ficha, se o saldo gravado é igual à soma das compras menos os pagamentos. Só lê; não altera
          nenhum saldo.
        </p>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "Conferindo..." : "Conferir agora"}
        </Button>

        {isError && <p className="text-destructive">Não foi possível conferir. Tente de novo.</p>}

        {divergencias && !isFetching && (
          divergencias.length === 0 ? (
            <p className="text-success font-medium">
              Nenhuma divergência — razão e saldo batem em todas as {fichas.length} fichas. Conferido às{" "}
              {horaSp(new Date(dataUpdatedAt))}.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-destructive font-medium">
                {divergencias.length} ficha(s) com divergência. Conferido às {horaSp(new Date(dataUpdatedAt))}.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-2 font-medium">Ficha</th>
                      <th className="py-1 pr-2 font-medium">Nome</th>
                      <th className="py-1 pr-2 font-medium">Saldo no banco</th>
                      <th className="py-1 pr-2 font-medium">Saldo pelo razão</th>
                      <th className="py-1 font-medium">Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {divergencias.map((d) => (
                      <tr key={d.fiador_id} className="border-t border-border">
                        <td className="py-1 pr-2 font-mono">#{d.numero_ficha}</td>
                        <td className="py-1 pr-2">{d.nome_aluno}</td>
                        <td className="py-1 pr-2">{formatSaldo(d.saldo_atual)}</td>
                        <td className="py-1 pr-2">{formatSaldo(d.saldo_razao)}</td>
                        <td className="py-1">{diferenca(d.saldo_atual - d.saldo_razao)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-muted-foreground">
                A correção é manual, pelo SQL Editor do Supabase, depois de um backup. Não há botão de corrigir aqui de
                propósito.
              </p>
            </div>
          )
        )}

        {comDivergenciaAceita.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border">
            <p className="font-medium text-foreground pt-2">Fechamentos com divergência aceita</p>
            {comDivergenciaAceita.map((p) => (
              <div key={p.id} className="text-muted-foreground">
                <p className="text-foreground">{intervalo(p.data_inicio, p.data_fim, true)}</p>
                {p.periodo_divergencias.map((d) => (
                  <p key={d.id} className="pl-3">
                    #{d.numero_ficha} {d.nome_aluno}: banco {formatSaldo(Number(d.saldo_atual))}, razão{" "}
                    {formatSaldo(Number(d.saldo_razao))}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SecaoIntegridade;
