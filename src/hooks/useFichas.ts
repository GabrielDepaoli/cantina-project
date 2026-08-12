import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Ficha = Tables<"fiadores">;
export type NovaFicha = TablesInsert<"fiadores">;
export type FichaUpdate = TablesUpdate<"fiadores">;

const FICHAS_QUERY_KEY = ["fichas"] as const;

export function useFichas() {
  return useQuery({
    queryKey: FICHAS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiadores")
        .select("*")
        .order("numero_ficha", { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}

export function useCreateFicha() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (novaFicha: NovaFicha) => {
      const { data, error } = await supabase
        .from("fiadores")
        .insert(novaFicha)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FICHAS_QUERY_KEY });
    },
  });
}

export function useUpdateFicha() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: FichaUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("fiadores")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FICHAS_QUERY_KEY });
    },
  });
}

interface RegistrarCompraInput {
  fiadorId: string;
  descricao: string;
  valor: number;
}

export function useRegistrarCompra() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ fiadorId, descricao, valor }: RegistrarCompraInput) => {
      const mesReferencia = new Date().toISOString().slice(0, 7); // "YYYY-MM"

      const { data, error } = await supabase.rpc("registrar_compra", {
        p_fiador_id: fiadorId,
        p_descricao: descricao,
        p_valor: valor,
        p_mes_referencia: mesReferencia,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FICHAS_QUERY_KEY });
    },
  });
}
