import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { ambienteAtual } from '@/config/ambiente';

// URL e chave já validadas em src/config/ambiente.ts (main.tsx só carrega o
// app quando a validação passa).
const { url: SUPABASE_URL, chave: SUPABASE_PUBLISHABLE_KEY } = ambienteAtual();

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
