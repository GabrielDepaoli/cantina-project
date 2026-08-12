import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn } = useAuth();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!usuario.trim() || !senha) {
      toast({ title: "Preencha usuário e senha", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await signIn(usuario, senha);
    setLoading(false);

    if (error) {
      toast({ title: "Erro ao entrar", description: error, variant: "destructive" });
      return;
    }

    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-2xl">🍽</span>
          </div>
          <h1 className="text-xl font-bold text-foreground">Cantina Fiado</h1>
          <p className="text-sm text-muted-foreground">Gerenciamento de Fichas</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Entrar</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="usuario">Usuário</Label>
                <Input
                  id="usuario"
                  autoFocus
                  value={usuario}
                  onChange={e => setUsuario(e.target.value)}
                  placeholder="admin"
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  type="password"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  placeholder="••••••"
                  className="h-12"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {loading ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default Login;
