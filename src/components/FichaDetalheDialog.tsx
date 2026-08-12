import { useEffect, useState } from "react";
import { Pencil, Plus, Minus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useUpdateFicha, type Ficha } from "@/hooks/useFichas";
import { useRegistrarPagamento, useExtrato } from "@/hooks/usePagamentos";
import { formatCpf, formatTelefone } from "@/lib/masks";

interface FichaDetalheDialogProps {
  ficha: Ficha | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FichaDetalheDialog = ({ ficha, open, onOpenChange }: FichaDetalheDialogProps) => {
  const { toast } = useToast();
  const updateFicha = useUpdateFicha();
  const registrarPagamento = useRegistrarPagamento();
  const { data: extrato = [], isLoading: extratoLoading } = useExtrato(ficha?.id);

  const [editando, setEditando] = useState(false);
  const [nomeAluno, setNomeAluno] = useState("");
  const [nomeResponsavel, setNomeResponsavel] = useState("");
  const [resp1Celular, setResp1Celular] = useState("");
  const [resp1Cpf, setResp1Cpf] = useState("");
  const [resp2Nome, setResp2Nome] = useState("");
  const [resp2Celular, setResp2Celular] = useState("");
  const [resp2Cpf, setResp2Cpf] = useState("");
  const [ativo, setAtivo] = useState(true);

  const [pagamentoValor, setPagamentoValor] = useState("");
  const [pagamentoObs, setPagamentoObs] = useState("");

  useEffect(() => {
    if (!ficha) return;
    setEditando(false);
    setNomeAluno(ficha.nome_aluno);
    setNomeResponsavel(ficha.nome_responsavel);
    setResp1Celular(ficha.resp1_celular ?? "");
    setResp1Cpf(ficha.resp1_cpf ?? "");
    setResp2Nome(ficha.resp2_nome ?? "");
    setResp2Celular(ficha.resp2_celular ?? "");
    setResp2Cpf(ficha.resp2_cpf ?? "");
    setAtivo(ficha.status === "ativo");
    setPagamentoValor("");
    setPagamentoObs("");
  }, [ficha]);

  if (!ficha) return null;

  const handleSalvarEdicao = () => {
    if (!resp1Celular.trim()) {
      toast({ title: "Erro", description: "O celular é obrigatório.", variant: "destructive" });
      return;
    }

    updateFicha.mutate(
      {
        id: ficha.id,
        nome_aluno: nomeAluno,
        nome_responsavel: nomeResponsavel,
        resp1_celular: resp1Celular || null,
        resp1_cpf: resp1Cpf || null,
        resp2_nome: resp2Nome || null,
        resp2_celular: resp2Celular || null,
        resp2_cpf: resp2Cpf || null,
        status: ativo ? "ativo" : "inativo",
      },
      {
        onSuccess: () => {
          toast({ title: "Ficha atualizada com sucesso!" });
          setEditando(false);
        },
        onError: () => {
          toast({ title: "Erro", description: "Não foi possível salvar as alterações.", variant: "destructive" });
        },
      }
    );
  };

  const handleRegistrarPagamento = () => {
    const valorNum = parseFloat(pagamentoValor.replace(",", "."));
    if (isNaN(valorNum) || valorNum <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor numérico maior que zero.", variant: "destructive" });
      return;
    }

    registrarPagamento.mutate(
      { fiadorId: ficha.id, valor: valorNum, observacao: pagamentoObs },
      {
        onSuccess: () => {
          toast({ title: "Pagamento registrado!", description: `R$ ${valorNum.toFixed(2)} abatido do saldo.` });
          setPagamentoValor("");
          setPagamentoObs("");
        },
        onError: () => {
          toast({ title: "Erro", description: "Não foi possível registrar o pagamento.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <span className="font-mono text-primary bg-primary/10 px-2 py-1 rounded">#{ficha.numero_ficha}</span>
            {ficha.nome_aluno}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
            <div>
              <p className="text-sm text-muted-foreground">Saldo atual</p>
              <p className={`text-2xl font-bold ${Number(ficha.saldo_atual) > 0 ? "text-destructive" : "text-success"}`}>
                R$ {Number(ficha.saldo_atual).toFixed(2)}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditando(e => !e)}>
              <Pencil className="w-4 h-4 mr-1" /> {editando ? "Cancelar" : "Editar"}
            </Button>
          </div>

          {editando ? (
            <div className="space-y-4 border border-border p-4 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Nome do Aluno/Proprietário</Label>
                  <Input value={nomeAluno} onChange={e => setNomeAluno(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nome do Responsável</Label>
                  <Input value={nomeResponsavel} onChange={e => setNomeResponsavel(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Celular (Obrigatório)</Label>
                  <Input
                    value={resp1Celular}
                    onChange={e => setResp1Celular(formatTelefone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CPF (Opcional)</Label>
                  <Input
                    value={resp1Cpf}
                    onChange={e => setResp1Cpf(formatCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Responsável 2 (Nome)</Label>
                  <Input value={resp2Nome} onChange={e => setResp2Nome(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Responsável 2 (Celular)</Label>
                  <Input
                    value={resp2Celular}
                    onChange={e => setResp2Celular(formatTelefone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Responsável 2 (CPF)</Label>
                  <Input
                    value={resp2Cpf}
                    onChange={e => setResp2Cpf(formatCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch id="ativo" checked={ativo} onCheckedChange={setAtivo} />
                <Label htmlFor="ativo" className="cursor-pointer">Ficha ativa</Label>
              </div>
              <Button
                onClick={handleSalvarEdicao}
                disabled={updateFicha.isPending}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {updateFicha.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          ) : (
            <div className="text-sm space-y-1 text-muted-foreground">
              <p>Responsável: <span className="text-foreground font-medium">{ficha.nome_responsavel}</span></p>
              {ficha.resp1_celular && <p>Celular: <span className="text-foreground">{ficha.resp1_celular}</span></p>}
              {ficha.resp2_nome && <p>Responsável 2: <span className="text-foreground">{ficha.resp2_nome}</span></p>}
              <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${ficha.status === "ativo" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                {ficha.status === "ativo" ? "Ativo" : "Inativo"}
              </span>
            </div>
          )}

          <div className="border border-border p-4 rounded-lg space-y-3">
            <h3 className="font-semibold text-sm">Registrar Pagamento</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Valor (R$)"
                value={pagamentoValor}
                onChange={e => setPagamentoValor(e.target.value)}
              />
              <Input
                placeholder="Observação (opcional)"
                value={pagamentoObs}
                onChange={e => setPagamentoObs(e.target.value)}
              />
            </div>
            <Button
              onClick={handleRegistrarPagamento}
              disabled={!pagamentoValor || registrarPagamento.isPending}
              className="w-full bg-success text-success-foreground hover:bg-success/90"
            >
              {registrarPagamento.isPending ? "Registrando..." : "Registrar Pagamento"}
            </Button>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Extrato</h3>
            {extratoLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
            {!extratoLoading && extrato.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma movimentação ainda.</p>
            )}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {extrato.map(item => (
                <div key={`${item.tipo}-${item.id}`} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    {item.tipo === "compra" ? (
                      <Minus className="w-3.5 h-3.5 text-destructive shrink-0" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 text-success shrink-0" />
                    )}
                    <div>
                      <p className="text-sm text-foreground">{item.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                  <span className={`font-semibold text-sm ${item.tipo === "compra" ? "text-destructive" : "text-success"}`}>
                    {item.tipo === "compra" ? "-" : "+"} R$ {Number(item.valor).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FichaDetalheDialog;
