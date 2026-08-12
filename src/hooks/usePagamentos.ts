import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface RegistrarPagamentoInput {
  fiadorId: string;
  valor: number;
  observacao?: string;
}

export function useRegistrarPagamento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ fiadorId, valor, observacao }: RegistrarPagamentoInput) => {
      const { data, error } = await supabase.rpc("registrar_pagamento", {
        p_fiador_id: fiadorId,
        p_valor: valor,
        p_observacao: observacao || undefined,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["fichas"] });
      queryClient.invalidateQueries({ queryKey: ["extrato", variables.fiadorId] });
    },
  });
}

export interface ExtratoItem {
  id: string;
  tipo: "compra" | "pagamento";
  descricao: string;
  valor: number;
  data: string;
}

export function useExtrato(fiadorId: string | undefined) {
  return useQuery({
    queryKey: ["extrato", fiadorId],
    queryFn: async (): Promise<ExtratoItem[]> => {
      if (!fiadorId) return [];

      const [comprasRes, pagamentosRes] = await Promise.all([
        supabase.from("compras").select("*").eq("fiador_id", fiadorId),
        supabase.from("pagamentos").select("*").eq("fiador_id", fiadorId),
      ]);

      if (comprasRes.error) throw comprasRes.error;
      if (pagamentosRes.error) throw pagamentosRes.error;

      const itens: ExtratoItem[] = [
        ...comprasRes.data.map((c) => ({
          id: c.id,
          tipo: "compra" as const,
          descricao: c.descricao,
          valor: c.valor,
          data: c.data,
        })),
        ...pagamentosRes.data.map((p) => ({
          id: p.id,
          tipo: "pagamento" as const,
          descricao: p.observacao || "Pagamento",
          valor: p.valor,
          data: p.data,
        })),
      ];

      return itens.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    },
    enabled: !!fiadorId,
  });
}
