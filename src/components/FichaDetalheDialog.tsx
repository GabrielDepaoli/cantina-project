import { useEffect, useState } from "react";
import { Pencil, Plus, Minus, Trash2, Lock, Unlock, StickyNote } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useUpdateFicha, useDeleteFicha, type Ficha } from "@/hooks/useFichas";
import { useRegistrarPagamento, useExtrato } from "@/hooks/usePagamentos";
import { formatCpf, formatTelefone, isCpfValido, isTelefoneValido } from "@/lib/masks";
import { formatSaldo } from "@/lib/saldo";

interface FichaDetalheDialogProps {
  ficha: Ficha | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FichaDetalheDialog = ({ ficha, open, onOpenChange }: FichaDetalheDialogProps) => {
  const { toast } = useToast();
  const updateFicha = useUpdateFicha();
  const deleteFicha = useDeleteFicha();
  const registrarPagamento = useRegistrarPagamento();
  const { data: extrato = [], isLoading: extratoLoading } = useExtrato(ficha?.id);

  const [editando, setEditando] = useState(false);
  const [mostrarAnotacao, setMostrarAnotacao] = useState(false);
  const [nomeAluno, setNomeAluno] = useState("");
  const [nomeResponsavel, setNomeResponsavel] = useState("");
  const [resp1Celular, setResp1Celular] = useState("");
  const [resp1Cpf, setResp1Cpf] = useState("");
  const [resp2Nome, setResp2Nome] = useState("");
  const [resp2Celular, setResp2Celular] = useState("");
  const [resp2Cpf, setResp2Cpf] = useState("");
  const [anotacao, setAnotacao] = useState("");

  const [pagamentoValor, setPagamentoValor] = useState("");
  const [pagamentoObs, setPagamentoObs] = useState("");

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmTrancarOpen, setConfirmTrancarOpen] = useState(false);

  useEffect(() => {
    if (!ficha) return;
    setEditando(false);
    setMostrarAnotacao(false);
    setNomeAluno(ficha.nome_aluno);
    setNomeResponsavel(ficha.nome_responsavel);
    setResp1Celular(ficha.resp1_celular ?? "");
    setResp1Cpf(ficha.resp1_cpf ?? "");
    setResp2Nome(ficha.resp2_nome ?? "");
    setResp2Celular(ficha.resp2_celular ?? "");
    setResp2Cpf(ficha.resp2_cpf ?? "");
    setAnotacao(ficha.observacoes ?? "");
    setPagamentoValor("");
    setPagamentoObs("");
  }, [ficha]);

  if (!ficha) return null;

  const handleSalvarEdicao = () => {
    if (!resp1Celular.trim()) {
      toast({ title: "Erro", description: "O celular é obrigatório.", variant: "destructive" });
      return;
    }
    if (!isTelefoneValido(resp1Celular)) {
      toast({ title: "Erro", description: "Celular inválido — informe DDD + 8 ou 9 dígitos.", variant: "destructive" });
      return;
    }
    if (!isCpfValido(resp1Cpf)) {
      toast({ title: "Erro", description: "CPF inválido — precisa ter 11 dígitos.", variant: "destructive" });
      return;
    }
    if (!isTelefoneValido(resp2Celular)) {
      toast({ title: "Erro", description: "Celular do Responsável 2 inválido — informe DDD + 8 ou 9 dígitos.", variant: "destructive" });
      return;
    }
    if (!isCpfValido(resp2Cpf)) {
      toast({ title: "Erro", description: "CPF do Responsável 2 inválido — precisa ter 11 dígitos.", variant: "destructive" });
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

  const handleToggleTrancar = () => {
    const novoValor = !ficha.bloqueada;
    updateFicha.mutate(
      { id: ficha.id, bloqueada: novoValor },
      {
        onSuccess: () => {
          toast({ title: novoValor ? "Conta trancada!" : "Conta destrancada!" });
          setConfirmTrancarOpen(false);
        },
        onError: () => {
          toast({ title: "Erro", description: "Não foi possível atualizar o bloqueio da conta.", variant: "destructive" });
        },
      }
    );
  };

  const handleToggleSomenteCredito = (checked: boolean) => {
    updateFicha.mutate(
      { id: ficha.id, somente_credito: checked },
      {
        onSuccess: () => {
          toast({
            title: checked ? "Somente crédito ativado" : "Somente crédito desativado",
            description: checked
              ? "Essa conta só vai poder gastar o crédito já adicionado a ela."
              : "Essa conta volta a poder ficar devendo (fiado normal).",
          });
        },
        onError: () => {
          toast({ title: "Erro", description: "Não foi possível atualizar essa opção.", variant: "destructive" });
        },
      }
    );
  };

  const handleSalvarAnotacao = () => {
    if (anotacao === (ficha.observacoes ?? "")) return;
    updateFicha.mutate(
      { id: ficha.id, observacoes: anotacao.trim() || null },
      {
        onSuccess: () => {
          toast({ title: "Anotação salva" });
        },
        onError: () => {
          toast({ title: "Erro", description: "Não foi possível salvar a anotação.", variant: "destructive" });
          setAnotacao(ficha.observacoes ?? "");
        },
      }
    );
  };

  const handleExcluirFicha = () => {
    deleteFicha.mutate(ficha.id, {
      onSuccess: () => {
        toast({ title: "Ficha excluída." });
        setConfirmDeleteOpen(false);
        onOpenChange(false);
      },
      onError: () => {
        toast({ title: "Erro", description: "Não foi possível excluir a ficha.", variant: "destructive" });
      },
    });
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
            <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${!ficha.bloqueada ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              {!ficha.bloqueada ? "Ativo" : "Bloqueada"}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
            <div>
              <p className="text-sm text-muted-foreground">Saldo atual</p>
              <p className={`text-2xl font-bold ${Number(ficha.saldo_atual) > 0 ? "text-destructive" : "text-success"}`}>
                {formatSaldo(Number(ficha.saldo_atual))}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditando(e => !e)}>
                <Pencil className="w-4 h-4 mr-1" /> {editando ? "Cancelar" : "Editar"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmTrancarOpen(true)}
                className="hover:bg-warning/10 hover:text-warning hover:border-warning/40"
              >
                {ficha.bloqueada ? <Unlock className="w-4 h-4 mr-1" /> : <Lock className="w-4 h-4 mr-1" />}
                {ficha.bloqueada ? "Destrancar Conta" : "Trancar Conta"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMostrarAnotacao(v => !v)}>
                <StickyNote className="w-4 h-4 mr-1" /> Anotação
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-muted/30">
            <div className="flex items-center gap-3">
              <Checkbox
                id="somente-credito"
                checked={ficha.somente_credito}
                onCheckedChange={handleToggleSomenteCredito}
                disabled={updateFicha.isPending}
                className="h-5 w-5 rounded-none"
              />
              <Label htmlFor="somente-credito" className="cursor-pointer text-sm text-muted-foreground">
                Disponibilizar SOMENTE valor Pré-Pago
              </Label>
            </div>
            <div className="text-sm text-muted-foreground text-right shrink-0">
              {ficha.tipo === "dependente" && (
                <p>Responsável: <span className="text-foreground font-medium">{ficha.nome_responsavel}</span></p>
              )}
              {ficha.resp1_celular && <p>Celular: <span className="text-foreground">{ficha.resp1_celular}</span></p>}
              {ficha.resp2_nome && (
                <p className="mt-1 pt-1 border-t border-border/60">
                  Responsável 2: <span className="text-foreground">{ficha.resp2_nome}</span>
                </p>
              )}
              {ficha.resp2_celular && <p>Celular: <span className="text-foreground">{ficha.resp2_celular}</span></p>}
            </div>
          </div>

          {mostrarAnotacao && (
            <div className="space-y-1">
              <Label htmlFor="anotacao" className="text-xs text-muted-foreground">Anotação</Label>
              <Textarea
                id="anotacao"
                value={anotacao}
                onChange={e => setAnotacao(e.target.value)}
                onBlur={handleSalvarAnotacao}
                placeholder="Ex: alergia a amendoim, só pode comprar salgado assado..."
                className="min-h-[60px] text-sm resize-none"
                autoFocus
              />
            </div>
          )}

          {editando ? (
            <div className="space-y-4 border border-border p-4 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Nome do Aluno/Proprietário</Label>
                  <Input value={nomeAluno} onChange={e => setNomeAluno(e.target.value)} />
                </div>
                {ficha.tipo === "dependente" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Nome do Responsável</Label>
                    <Input value={nomeResponsavel} onChange={e => setNomeResponsavel(e.target.value)} />
                  </div>
                )}
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
              <Button
                onClick={handleSalvarEdicao}
                disabled={updateFicha.isPending}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {updateFicha.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmDeleteOpen(true)}
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4 mr-1" /> Excluir Ficha
              </Button>
            </div>
          ) : null}

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

      <Dialog open={confirmTrancarOpen} onOpenChange={setConfirmTrancarOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{ficha.bloqueada ? "Destrancar" : "Trancar"} conta #{ficha.numero_ficha}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {ficha.bloqueada
              ? "A conta volta a poder receber novas vendas normalmente."
              : "Nenhuma venda nova vai poder ser registrada nessa conta até você destrancar. Pagamentos continuam permitidos normalmente."}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmTrancarOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleToggleTrancar}
              disabled={updateFicha.isPending}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              {updateFicha.isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir ficha #{ficha.numero_ficha}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Isso remove a ficha e todo o histórico de compras e pagamentos dela permanentemente. Essa ação não pode
            ser desfeita.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleExcluirFicha}
              disabled={deleteFicha.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFicha.isPending ? "Excluindo..." : "Confirmar Exclusão"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default FichaDetalheDialog;
