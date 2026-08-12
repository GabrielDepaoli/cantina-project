import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const FECHAMENTOS_QUERY_KEY = ["fechamentos"] as const;

export function useFechamentos() {
  return useQuery({
    queryKey: FECHAMENTOS_QUERY_KEY,
    queryFn: async () => {
      const [fechamentosRes, fichasRes] = await Promise.all([
        supabase.from("fechamentos").select("*").order("mes_referencia", { ascending: false }),
        supabase.from("fiadores").select("id, numero_ficha, nome_aluno"),
      ]);

      if (fechamentosRes.error) throw fechamentosRes.error;
      if (fichasRes.error) throw fichasRes.error;

      const fichaPorId = new Map(fichasRes.data.map((f) => [f.id, f]));

      return fechamentosRes.data.map((fechamento) => ({
        ...fechamento,
        ficha: fichaPorId.get(fechamento.fiador_id) ?? null,
      }));
    },
  });
}

export function useFecharMes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mesReferencia: string) => {
      const { data, error } = await supabase.rpc("fechar_mes", { p_mes_referencia: mesReferencia });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FECHAMENTOS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["fichas"] });
    },
  });
}
