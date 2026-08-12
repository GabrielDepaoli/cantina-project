import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const EMAIL_DOMAIN = "cantina.local";
// A conta no Supabase exige senha com 6+ caracteres, então "123" (o que a pessoa
// digita na tela) é convertido pra "123456" (a senha real da conta) aqui dentro.
const SENHA_EXIBIDA = "123";
const SENHA_REAL = "123456";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (usuario: string, senha: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      // LOGIN DESATIVADO TEMPORARIAMENTE PARA DESENVOLVIMENTO (ver ProtectedRoute.tsx).
      // Sem isso, com a tela de login pulada, o app nunca autentica de verdade e
      // toda escrita no banco é barrada pela RLS. Loga como admin automaticamente
      // nos bastidores enquanto o bypass estiver ativo. Para reativar: apague este
      // bloco junto com o bypass em ProtectedRoute.tsx.
      if (!data.session) {
        await signIn("admin", "123");
        const refreshed = await supabase.auth.getSession();
        setSession(refreshed.data.session);
        setLoading(false);
        return;
      }

      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (usuario: string, senha: string) => {
    const email = `${usuario.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
    const password = senha === SENHA_EXIBIDA ? SENHA_REAL : senha;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? "Usuário ou senha inválidos." : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  return ctx;
}
