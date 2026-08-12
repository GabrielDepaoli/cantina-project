import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Plus, Users, DollarSign, FileText, BarChart3, LogOut, Menu as MenuIcon, Eye, EyeOff, ShoppingCart, AlertCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useFichas, useCreateFicha, type Ficha } from "@/hooks/useFichas";
import { useFechamentos, useFecharMes } from "@/hooks/useFechamentos";
import { useFaturamentoDia } from "@/hooks/useFaturamento";
import { useVendas } from "@/hooks/useVendas";
import FichaDetalheDialog from "@/components/FichaDetalheDialog";
import NovaVendaDialog from "@/components/NovaVendaDialog";
import { formatCpf, formatTelefone } from "@/lib/masks";
import { formatSaldo } from "@/lib/saldo";
import { cantinaConfig } from "@/config/cantina";

type View = "menu" | "dashboard" | "fichas" | "compra" | "relatorios";

const Index = () => {
  const { toast } = useToast();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const { data: fichas = [], isLoading } = useFichas();
  const createFicha = useCreateFicha();
  const { data: fechamentos = [] } = useFechamentos();
  const fecharMes = useFecharMes();
  const { data: faturamentoDia = 0 } = useFaturamentoDia();
  const { data: vendas = [] } = useVendas();

  const [view, setView] = useState<View>("menu");
  const [mostrarFaturamento, setMostrarFaturamento] = useState(false);
  const [search, setSearch] = useState("");
  const [detalheFicha, setDetalheFicha] = useState<Ficha | null>(null);
  const [detalheOpen, setDetalheOpen] = useState(false);
  const [fecharMesOpen, setFecharMesOpen] = useState(false);
  const [novaVendaOpen, setNovaVendaOpen] = useState(false);
  const [novaVendaFichaId, setNovaVendaFichaId] = useState<string | null>(null);
  const [vendaModoRecreio, setVendaModoRecreio] = useState(false);

  // Esconde o faturamento sempre que a aba Menu é (re)aberta.
  useEffect(() => {
    if (view === "menu") setMostrarFaturamento(false);
  }, [view]);

  // Estados para Nova Ficha
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [novaFichaNumero, setNovaFichaNumero] = useState("");
  const [novaFichaTipo, setNovaFichaTipo] = useState<"dependente" | "independente">("dependente");
  const [novaFichaNome, setNovaFichaNome] = useState("");
  // Dependente
  const [resp1Nome, setResp1Nome] = useState("");
  const [resp1Celular, setResp1Celular] = useState("");
  const [resp1Cpf, setResp1Cpf] = useState("");
  const [resp2Nome, setResp2Nome] = useState("");
  const [resp2Celular, setResp2Celular] = useState("");
  const [resp2Cpf, setResp2Cpf] = useState("");
  // Independente
  const [indepCelular, setIndepCelular] = useState("");
  const [indepCpf, setIndepCpf] = useState("");

  const totalReceber = fichas.reduce((s, f) => s + Number(f.saldo_atual), 0);
  const fichasAtivas = fichas.filter(f => !f.bloqueada).length;
  const topFichas = [...fichas].sort((a, b) => Number(b.saldo_atual) - Number(a.saldo_atual)).slice(0, 3);

  const filteredFichas = fichas.filter(f =>
    f.numero_ficha.includes(search) ||
    f.nome_aluno.toLowerCase().includes(search.toLowerCase()) ||
    f.nome_responsavel.toLowerCase().includes(search.toLowerCase())
  );

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const mesAtualRef = new Date().toISOString().slice(0, 7);
  const mesAtualNome = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const dataHoje = new Date().toLocaleDateString("pt-BR");

  const abrirNovaVenda = (fichaId: string | null = null) => {
    setNovaVendaFichaId(fichaId);
    setNovaVendaOpen(true);
  };

  // Atalho: barra de espaço abre o modal de Nova Venda de qualquer lugar,
  // exceto enquanto o usuário está digitando ou já tem algum modal aberto.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement;
      const digitando = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (digitando || novaVendaOpen || detalheOpen || isModalOpen || fecharMesOpen) return;
      e.preventDefault();
      abrirNovaVenda();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [novaVendaOpen, detalheOpen, isModalOpen, fecharMesOpen]);

  const handleAtalhoMock = (label: string) => {
    toast({ title: label, description: "Essa funcionalidade ainda vai ser desenvolvida." });
  };

  const menuAtalhos = [
    { label: "Realizar uma nova venda", icon: ShoppingCart, onClick: () => abrirNovaVenda() },
    {
      label: "Verificar devedores",
      icon: AlertCircle,
      descricao: "Fichas com mais de 1 mês em aberto (em breve)",
      onClick: () => handleAtalhoMock("Verificar devedores"),
    },
    { label: "Gerar relatório", icon: FileText, onClick: () => handleAtalhoMock("Gerar relatório") },
    { label: "Cadastrar produto", icon: Package, onClick: () => handleAtalhoMock("Cadastrar produto") },
  ];

  const handleFecharMes = () => {
    fecharMes.mutate(mesAtualRef, {
      onSuccess: (count) => {
        toast({ title: "Mês fechado!", description: `${count} ficha(s) processada(s).` });
        setFecharMesOpen(false);
      },
      onError: () => {
        toast({ title: "Erro", description: "Não foi possível fechar o mês.", variant: "destructive" });
      },
    });
  };

  const handleCriarFicha = () => {
    // Validar Número (3 dígitos)
    let numeroFormatado = novaFichaNumero.trim();
    if (numeroFormatado.length === 0) {
      toast({ title: "Erro", description: "Informe o número da ficha.", variant: "destructive" });
      return;
    }

    // Preenche com zeros à esquerda para ter 3 dígitos (ex: "5" -> "005")
    numeroFormatado = numeroFormatado.padStart(3, "0");

    if (numeroFormatado.length > 3) {
      toast({ title: "Erro", description: "O número da ficha deve ter no máximo 3 caracteres.", variant: "destructive" });
      return;
    }

    // Validar duplicidade
    if (fichas.some(f => f.numero_ficha === numeroFormatado)) {
      toast({ title: "Erro", description: `A ficha número ${numeroFormatado} já existe.`, variant: "destructive" });
      return;
    }

    if (!novaFichaNome.trim()) {
      toast({ title: "Erro", description: "Informe o nome do proprietário/aluno.", variant: "destructive" });
      return;
    }

    let responsavelNome = "O Próprio";
    if (novaFichaTipo === "dependente") {
      if (!resp1Nome.trim()) {
        toast({ title: "Erro", description: "Para dependentes, informe o nome do Responsável 1.", variant: "destructive" });
        return;
      }
      if (!resp1Celular.trim()) {
        toast({ title: "Erro", description: "Para dependentes, informe o celular do Responsável 1.", variant: "destructive" });
        return;
      }
      responsavelNome = resp1Nome;
    } else {
      if (!indepCelular.trim()) {
        toast({ title: "Erro", description: "Para independentes, informe o celular do titular.", variant: "destructive" });
        return;
      }
    }

    createFicha.mutate(
      {
        numero_ficha: numeroFormatado,
        nome_aluno: novaFichaNome,
        nome_responsavel: responsavelNome,
        tipo: novaFichaTipo,
        resp1_celular: novaFichaTipo === "dependente" ? resp1Celular || null : indepCelular || null,
        resp1_cpf: novaFichaTipo === "dependente" ? resp1Cpf || null : indepCpf || null,
        resp2_nome: novaFichaTipo === "dependente" ? resp2Nome || null : null,
        resp2_celular: novaFichaTipo === "dependente" ? resp2Celular || null : null,
        resp2_cpf: novaFichaTipo === "dependente" ? resp2Cpf || null : null,
      },
      {
        onSuccess: () => {
          toast({ title: "Sucesso", description: `Ficha ${numeroFormatado} criada com sucesso!` });

          // Reset do modal
          setIsModalOpen(false);
          setNovaFichaNumero("");
          setNovaFichaNome("");
          setResp1Nome(""); setResp1Celular(""); setResp1Cpf("");
          setResp2Nome(""); setResp2Celular(""); setResp2Cpf("");
          setIndepCelular(""); setIndepCpf("");
        },
        onError: () => {
          toast({ title: "Erro", description: "Não foi possível salvar a ficha. Tente novamente.", variant: "destructive" });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Carregando fichas...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">🍽</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">{cantinaConfig.nome}</h1>
              <p className="text-xs text-muted-foreground">{cantinaConfig.proprietario}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-1" /> Sair
          </Button>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4 flex gap-1 overflow-x-auto">
          {[
            { key: "menu" as View, label: "Menu", icon: MenuIcon },
            { key: "fichas" as View, label: "Fichas", icon: Users },
            { key: "compra" as View, label: "Vendas", icon: Plus },
            { key: "relatorios" as View, label: "Relatórios", icon: FileText },
            { key: "dashboard" as View, label: "Controle", icon: BarChart3 },
          ].map(item => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${view === item.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="container mx-auto px-4 py-6">
        {/* MENU */}
        {view === "menu" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4">
              <Card className="bg-primary border-none">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-primary-foreground/80">Faturamento do dia</p>
                      <p className="text-3xl font-bold text-primary-foreground">
                        {mostrarFaturamento ? `R$ ${faturamentoDia.toFixed(2)}` : "R$ ••••••"}
                      </p>
                    </div>
                    <button
                      onClick={() => setMostrarFaturamento(v => !v)}
                      className="text-primary-foreground/70 hover:text-primary-foreground transition-colors"
                      aria-label={mostrarFaturamento ? "Esconder valor" : "Mostrar valor"}
                    >
                      {mostrarFaturamento ? <Eye className="w-6 h-6" /> : <EyeOff className="w-6 h-6" />}
                    </button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 h-full flex flex-col items-center justify-center">
                  <p className="text-xs text-muted-foreground">Hoje</p>
                  <p className="text-lg font-bold text-foreground">{dataHoje}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {menuAtalhos.map(item => (
                <Card
                  key={item.label}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={item.onClick}
                >
                  <CardContent className="p-6 text-center">
                    <item.icon className="w-10 h-10 text-primary mx-auto mb-3" />
                    <p className="font-semibold text-foreground">{item.label}</p>
                    {item.descricao && <p className="text-xs text-muted-foreground mt-1">{item.descricao}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        )}

        {/* DASHBOARD */}
        {view === "dashboard" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="bg-primary border-none">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-primary-foreground/80">Total a Receber</p>
                      <p className="text-3xl font-bold text-primary-foreground">R$ {totalReceber.toFixed(2)}</p>
                    </div>
                    <DollarSign className="w-10 h-10 text-primary-foreground/40" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Fichas Ativas</p>
                      <p className="text-3xl font-bold text-foreground">{fichasAtivas}</p>
                    </div>
                    <Users className="w-10 h-10 text-muted-foreground/40" />
                  </div>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => abrirNovaVenda()}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Ação Rápida</p>
                      <p className="text-lg font-bold text-primary">+ Nova Venda</p>
                    </div>
                    <Plus className="w-10 h-10 text-primary/40" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Search */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Busca Rápida por Ficha</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    placeholder="Número da ficha, nome do aluno ou responsável..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-10 h-12 text-base"
                  />
                </div>
                {search && (
                  <div className="mt-3 space-y-2">
                    {filteredFichas.map(f => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                        onClick={() => abrirNovaVenda(f.id)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-primary bg-primary/10 px-2 py-1 rounded">#{f.numero_ficha}</span>
                          <div>
                            <p className="font-medium text-foreground">{f.nome_aluno}</p>
                            <p className="text-xs text-muted-foreground">Resp: {f.nome_responsavel}</p>
                          </div>
                        </div>
                        <span className={`font-bold text-lg ${Number(f.saldo_atual) > 0 ? "text-destructive" : "text-success"}`}>
                          {formatSaldo(Number(f.saldo_atual))}
                        </span>
                      </div>
                    ))}
                    {filteredFichas.length === 0 && <p className="text-center text-muted-foreground py-4">Nenhuma ficha encontrada.</p>}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Fichas */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Maiores Saldos Pendentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topFichas.map((f, i) => (
                  <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center">{i + 1}</span>
                      <div>
                        <p className="font-medium text-foreground">{f.nome_aluno}</p>
                        <p className="text-xs text-muted-foreground">Ficha #{f.numero_ficha}</p>
                      </div>
                    </div>
                    <span className="font-bold text-destructive">{formatSaldo(Number(f.saldo_atual))}</span>
                  </div>
                ))}
                {topFichas.length === 0 && <p className="text-center text-muted-foreground py-4">Nenhuma ficha cadastrada ainda.</p>}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* FICHAS */}
        {view === "fichas" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Fichas Cadastradas</h2>

              <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <Plus className="w-4 h-4 mr-2" /> Nova Ficha
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold">Cadastrar Nova Ficha</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-6 pt-4">

                    {/* Linha 1: Número da Ficha e Tipo de Conta */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="numero">Número da Ficha (3 dígitos)</Label>
                        <Input
                          id="numero"
                          placeholder="Ex: 001"
                          maxLength={3}
                          value={novaFichaNumero}
                          onChange={e => setNovaFichaNumero(e.target.value.replace(/\D/g, ''))} // Apenas números
                        />
                        <p className="text-xs text-muted-foreground">Será preenchido com zeros à esquerda (ex: 5 vira 005)</p>
                      </div>

                      <div className="space-y-3">
                        <Label>Tipo de Conta</Label>
                        <div className="flex items-center space-x-3 pt-1">
                          <Label
                            htmlFor="tipo-conta"
                            className={`cursor-pointer ${novaFichaTipo === "dependente" ? "font-bold text-primary" : "text-muted-foreground"}`}
                            onClick={() => setNovaFichaTipo("dependente")}
                          >
                            Dependente (Aluno)
                          </Label>
                          <Switch
                            id="tipo-conta"
                            checked={novaFichaTipo === "independente"}
                            onCheckedChange={(checked) => setNovaFichaTipo(checked ? "independente" : "dependente")}
                          />
                          <Label
                            htmlFor="tipo-conta"
                            className={`cursor-pointer ${novaFichaTipo === "independente" ? "font-bold text-primary" : "text-muted-foreground"}`}
                            onClick={() => setNovaFichaTipo("independente")}
                          >
                            Independente (Prof/Func)
                          </Label>
                        </div>
                      </div>
                    </div>

                    {/* Linha 2: Nome do Proprietário/Aluno */}
                    <div className="space-y-2">
                      <Label htmlFor="nomeProprietario">
                        {novaFichaTipo === "dependente" ? "Nome do Aluno" : "Nome do Proprietário"}
                      </Label>
                      <Input
                        id="nomeProprietario"
                        placeholder={novaFichaTipo === "dependente" ? "Ex: João Silva" : "Ex: Prof. Roberto"}
                        value={novaFichaNome}
                        onChange={e => setNovaFichaNome(e.target.value)}
                      />
                    </div>

                    {/* Blocos Condicionais */}
                    {novaFichaTipo === "dependente" ? (
                      <div className="space-y-6 border border-border p-4 rounded-lg bg-card mt-4">
                        <h3 className="font-semibold text-sm">Dados dos Responsáveis</h3>

                        <div className="space-y-4">
                          <p className="text-xs font-medium text-muted-foreground uppercase">Responsável 1 (Obrigatório)</p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                              <Label className="text-xs">Nome</Label>
                              <Input placeholder="Nome Completo" value={resp1Nome} onChange={e => setResp1Nome(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Celular (Obrigatório)</Label>
                              <Input
                                placeholder="(00) 00000-0000"
                                maxLength={15}
                                value={resp1Celular}
                                onChange={e => setResp1Celular(formatTelefone(e.target.value))}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">CPF (Opcional)</Label>
                              <Input
                                placeholder="000.000.000-00"
                                maxLength={14}
                                value={resp1Cpf}
                                onChange={e => setResp1Cpf(formatCpf(e.target.value))}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <p className="text-xs font-medium text-muted-foreground uppercase">Responsável 2 (Opcional)</p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                              <Label className="text-xs">Nome</Label>
                              <Input placeholder="Nome Completo" value={resp2Nome} onChange={e => setResp2Nome(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Celular</Label>
                              <Input
                                placeholder="(00) 00000-0000"
                                maxLength={15}
                                value={resp2Celular}
                                onChange={e => setResp2Celular(formatTelefone(e.target.value))}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">CPF</Label>
                              <Input
                                placeholder="000.000.000-00"
                                maxLength={14}
                                value={resp2Cpf}
                                onChange={e => setResp2Cpf(formatCpf(e.target.value))}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 border border-border p-4 rounded-lg bg-card mt-4">
                        <h3 className="font-semibold text-sm">Contato do Titular</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs">Celular (Obrigatório)</Label>
                            <Input
                              placeholder="(00) 00000-0000"
                              maxLength={15}
                              value={indepCelular}
                              onChange={e => setIndepCelular(formatTelefone(e.target.value))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">CPF (Opcional)</Label>
                            <Input
                              placeholder="000.000.000-00"
                              maxLength={14}
                              value={indepCpf}
                              onChange={e => setIndepCpf(formatCpf(e.target.value))}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-4 space-x-2">
                      <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                      <Button className="bg-primary" onClick={handleCriarFicha} disabled={createFicha.isPending}>
                        {createFicha.isPending ? "Salvando..." : "Salvar Ficha"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar ficha..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="space-y-2">
              {filteredFichas.map(f => (
                <Card
                  key={f.id}
                  className="hover:shadow-sm transition-shadow cursor-pointer"
                  onClick={() => { setDetalheFicha(f); setDetalheOpen(true); }}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="font-mono font-bold text-primary bg-primary/10 px-3 py-2 rounded-lg text-lg">#{f.numero_ficha}</span>
                      <div>
                        <p className="font-semibold text-foreground">{f.nome_aluno}</p>
                        <p className="text-sm text-muted-foreground">Responsável: {f.nome_responsavel}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-xl font-bold ${Number(f.saldo_atual) > 0 ? "text-destructive" : "text-success"}`}>
                        {formatSaldo(Number(f.saldo_atual))}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${!f.bloqueada ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        {!f.bloqueada ? "Ativo" : "Bloqueada"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredFichas.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma ficha encontrada.
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* VENDAS */}
        {view === "compra" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-xl font-bold text-foreground">Vendas</h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch id="modo-recreio" checked={vendaModoRecreio} onCheckedChange={setVendaModoRecreio} />
                  <Label htmlFor="modo-recreio" className="cursor-pointer text-sm text-muted-foreground">
                    Modo recreio
                  </Label>
                </div>
                <Button
                  onClick={() => abrirNovaVenda()}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="w-4 h-4 mr-2" /> Realizar Nova Venda
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {vendas.map(v => (
                <Card
                  key={v.id}
                  className="hover:shadow-sm transition-shadow cursor-pointer"
                  onClick={() => {
                    const f = fichas.find(x => x.id === v.fiador_id);
                    if (f) { setDetalheFicha(f); setDetalheOpen(true); }
                  }}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{v.descricao}</p>
                      <p className="text-sm text-muted-foreground">
                        {v.ficha ? `#${v.ficha.numero_ficha} — ${v.ficha.nome_aluno}` : "Ficha removida"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(v.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        {" às "}
                        {new Date(v.data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <span className="text-lg font-bold text-destructive">R$ {Number(v.valor).toFixed(2)}</span>
                  </CardContent>
                </Card>
              ))}
              {vendas.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma venda registrada ainda.
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* RELATÓRIOS */}
        {view === "relatorios" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <h2 className="text-xl font-bold text-foreground">Relatórios</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-6 text-center">
                  <FileText className="w-12 h-12 text-primary mx-auto mb-3" />
                  <p className="font-semibold text-foreground">Fichas com Saldo Pendente</p>
                  <p className="text-sm text-muted-foreground mt-1">{fichas.filter(f => Number(f.saldo_atual) > 0).length} fichas</p>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-6 text-center">
                  <DollarSign className="w-12 h-12 text-primary mx-auto mb-3" />
                  <p className="font-semibold text-foreground">Total Geral a Receber</p>
                  <p className="text-2xl font-bold text-primary mt-1">R$ {totalReceber.toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-6 text-center">
                  <FileText className="w-12 h-12 text-accent mx-auto mb-3" />
                  <p className="font-semibold text-foreground">Exportar Relatório</p>
                  <p className="text-sm text-muted-foreground mt-1">PDF ou Excel</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Fechamento Mensal</CardTitle>
                <Dialog open={fecharMesOpen} onOpenChange={setFecharMesOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                      <BarChart3 className="w-4 h-4 mr-2" /> Fechar Mês Atual
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="capitalize">Fechar {mesAtualNome}?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                      Isso arquiva as compras em aberto deste mês de todas as fichas ativas, registrando quanto era
                      devido e quanto já foi pago (via pagamentos avulsos registrados durante o mês). Fichas sem
                      compras neste mês não são afetadas. O saldo em aberto continua normalmente na ficha.
                    </p>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => setFecharMesOpen(false)}>Cancelar</Button>
                      <Button
                        onClick={handleFecharMes}
                        disabled={fecharMes.isPending}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        {fecharMes.isPending ? "Fechando..." : "Confirmar"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="space-y-2">
                {fechamentos.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum fechamento registrado ainda.</p>
                )}
                {fechamentos.map(f => (
                  <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div>
                      <p className="font-medium text-foreground">
                        {f.ficha ? `#${f.ficha.numero_ficha} — ${f.ficha.nome_aluno}` : "Ficha removida"}
                      </p>
                      <p className="text-xs text-muted-foreground">{f.mes_referencia}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Devido: R$ {Number(f.total).toFixed(2)}</p>
                      <p className={`text-sm font-semibold ${Number(f.valor_pago) >= Number(f.total) ? "text-success" : "text-destructive"}`}>
                        Pago: R$ {Number(f.valor_pago).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </main>

      <FichaDetalheDialog
        ficha={fichas.find(f => f.id === detalheFicha?.id) ?? detalheFicha}
        open={detalheOpen}
        onOpenChange={setDetalheOpen}
      />
      <NovaVendaDialog
        open={novaVendaOpen}
        onOpenChange={setNovaVendaOpen}
        initialFichaId={novaVendaFichaId}
        modoRecreio={vendaModoRecreio}
      />
    </div>
  );
};

export default Index;
