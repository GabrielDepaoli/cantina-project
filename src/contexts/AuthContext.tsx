import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const EMAIL_DOMAIN = "cantina.local";
// Credenciais só do auto-login de desenvolvimento (ver bloco abaixo). Vêm do
// .env, que não é commitado — nunca hardcode senha aqui.
const DEV_ADMIN_EMAIL = import.meta.env.VITE_DEV_ADMIN_EMAIL as string | undefined;
const DEV_ADMIN_PASSWORD = import.meta.env.VITE_DEV_ADMIN_PASSWORD as string | undefined;

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
      // toda escrita no banco é barrada pela RLS. Loga automaticamente nos
      // bastidores usando as credenciais do .env (nunca hardcoded/commitadas).
      // Para reativar o login normal: apague este bloco junto com o bypass em
      // ProtectedRoute.tsx.
      if (!data.session && DEV_ADMIN_EMAIL && DEV_ADMIN_PASSWORD) {
        await supabase.auth.signInWithPassword({ email: DEV_ADMIN_EMAIL, password: DEV_ADMIN_PASSWORD });
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
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
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
