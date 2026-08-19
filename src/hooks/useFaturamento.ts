import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useFaturamentoDia() {
  return useQuery({
    queryKey: ["faturamento-dia"],
    queryFn: async () => {
      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      const fim = new Date(inicio);
      fim.setDate(fim.getDate() + 1);

      const { data, error } = await supabase
        .from("compras")
        .select("valor")
        .gte("data", inicio.toISOString())
        .lt("data", fim.toISOString());

      if (error) throw error;
      return data.reduce((soma, c) => soma + Number(c.valor), 0);
    },
  });
}
