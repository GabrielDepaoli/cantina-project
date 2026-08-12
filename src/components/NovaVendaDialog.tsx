import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useFichas, useRegistrarCompra, type Ficha } from "@/hooks/useFichas";

interface NovaVendaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFichaId?: string | null;
}

const NovaVendaDialog = ({ open, onOpenChange, initialFichaId }: NovaVendaDialogProps) => {
  const { toast } = useToast();
  const { data: fichas = [] } = useFichas();
  const registrarCompra = useRegistrarCompra();

  const [search, setSearch] = useState("");
  const [selectedFicha, setSelectedFicha] = useState<Ficha | null>(null);
  const [compraDesc, setCompraDesc] = useState("");
  const [compraValor, setCompraValor] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setCompraDesc("");
    setCompraValor("");
    setSelectedFicha(initialFichaId ? fichas.find(f => f.id === initialFichaId) ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFichaId]);

  const filteredFichas = fichas.filter(f =>
    f.numero_ficha.includes(search) ||
    f.nome_aluno.toLowerCase().includes(search.toLowerCase()) ||
    f.nome_responsavel.toLowerCase().includes(search.toLowerCase())
  );

  const handleRegistrarCompra = () => {
    if (!selectedFicha || !compraDesc || !compraValor) return;

    if (selectedFicha.status === "inativo") {
      toast({ title: "Ficha inativa", description: "Não é possível registrar vendas em uma ficha inativa.", variant: "destructive" });
      return;
    }

    const valorNum = parseFloat(compraValor.replace(",", "."));
    if (isNaN(valorNum)) {
      toast({ title: "Valor inválido", description: "Informe um valor numérico válido.", variant: "destructive" });
      return;
    }

    registrarCompra.mutate(
      { fiadorId: selectedFicha.id, descricao: compraDesc, valor: valorNum },
      {
        onSuccess: () => {
          toast({
            title: "Venda registrada com sucesso!",
            description: `${compraDesc} - R$ ${valorNum.toFixed(2)} na ficha ${selectedFicha.numero_ficha}`,
          });
          onOpenChange(false);
        },
        onError: () => {
          toast({ title: "Erro ao registrar venda", description: "Tente novamente.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Realizar Nova Venda</DialogTitle>
        </DialogHeader>

        {!selectedFicha ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número ou nome..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-12"
                autoFocus
              />
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredFichas.map(f => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFicha(f)}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-primary/10 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-primary">#{f.numero_ficha}</span>
                    <span className="font-medium text-foreground">{f.nome_aluno}</span>
                    {f.status === "inativo" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Inativo</span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">R$ {Number(f.saldo_atual).toFixed(2)}</span>
                </button>
              ))}
              {filteredFichas.length === 0 && (
                <p className="text-center text-muted-foreground py-4">Nenhuma ficha encontrada.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Card className={selectedFicha.status === "inativo" ? "border-destructive/30 bg-destructive/5" : "border-primary/30 bg-primary/5"}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ficha selecionada</p>
                  <p className="font-bold text-foreground text-lg">#{selectedFicha.numero_ficha} — {selectedFicha.nome_aluno}</p>
                  <p className="text-sm text-muted-foreground">
                    Saldo atual: <span className="font-bold text-destructive">R$ {Number(selectedFicha.saldo_atual).toFixed(2)}</span>
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedFicha(null)}>Trocar</Button>
              </CardContent>
            </Card>

            {selectedFicha.status === "inativo" ? (
              <Card className="border-destructive/30">
                <CardContent className="p-6 text-center">
                  <p className="font-semibold text-destructive">Ficha inativa</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Não é possível registrar vendas em uma ficha inativa. Reative a ficha para continuar.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Descrição do Produto</label>
                  <Input
                    placeholder="Ex: Salgado + Suco"
                    value={compraDesc}
                    onChange={e => setCompraDesc(e.target.value)}
                    className="h-12"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Valor (R$)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={compraValor}
                    onChange={e => setCompraValor(e.target.value)}
                    className="h-14 text-2xl font-bold text-center"
                  />
                </div>
                <Button
                  onClick={handleRegistrarCompra}
                  disabled={!compraDesc || !compraValor || registrarCompra.isPending}
                  className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {registrarCompra.isPending ? "Registrando..." : "Registrar Venda"}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default NovaVendaDialog;
