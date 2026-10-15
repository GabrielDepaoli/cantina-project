import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Ficha = Tables<"fiadores">;

// Só as colunas que o banco deixa o app gravar direto (GRANT por coluna na
// migration do fechamento). saldo_atual muda apenas pelas RPCs.
type ColunaEditavel =
  | "nome_aluno" | "nome_responsavel" | "resp1_celular" | "resp1_cpf" | "resp2_nome"
  | "resp2_celular" | "resp2_cpf" | "observacoes" | "bloqueada" | "somente_credito";
export type NovaFicha = Pick<TablesInsert<"fiadores">, ColunaEditavel | "numero_ficha" | "tipo">;
export type FichaUpdate = Pick<TablesUpdate<"fiadores">, ColunaEditavel>;

const FICHAS_QUERY_KEY = ["fichas"] as const;
const FECHAMENTO_QUERY_KEY = ["fechamento"] as const; // ver useFechamentos.ts

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

export function useDeleteFicha() {
  const queryClient = useQueryClient();

  return useMutation({
    // Ficha com fechamento em aberto: o banco recusa com o código CF001 (use
    // mensagemErro). Com .select(), uma exclusão barrada em silêncio (zero
    // linhas, sem erro) vira erro aqui em vez de parecer que deu certo.
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("fiadores").delete().eq("id", id).select("id");
      if (error) throw error;
      if (data?.length !== 1) throw new Error("A ficha não foi excluída.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FICHAS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: FECHAMENTO_QUERY_KEY });
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: FICHAS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["vendas"] });
      queryClient.invalidateQueries({ queryKey: ["faturamento-dia"] });
      queryClient.invalidateQueries({ queryKey: ["extrato", variables.fiadorId] });
      // Compra muda a prévia do fechamento e pode mudar o primeiro período.
      queryClient.invalidateQueries({ queryKey: FECHAMENTO_QUERY_KEY });
    },
  });
}
