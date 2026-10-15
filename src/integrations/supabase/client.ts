import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { ambienteAtual } from '@/config/ambiente';

// URL e chave já validadas em src/config/ambiente.ts (main.tsx só carrega o
// app quando a validação passa).
const { url: SUPABASE_URL, chave: SUPABASE_PUBLISHABLE_KEY } = ambienteAtual();

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// Sessão em sessionStorage: vale enquanto a aba estiver aberta (F5 não pede
// login de novo), mas fechar o navegador ou a aba exige login outra vez.
// Decisão de 15/10/2026: login a cada abertura.
// Antes a sessão ficava no localStorage, onde sobreviveria para sempre: apaga
// o token que tiver sobrado de lá (sb-<ref>-auth-token).
for (const chave of Object.keys(localStorage)) {
  if (/^sb-.+-auth-token$/.test(chave)) localStorage.removeItem(chave);
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
