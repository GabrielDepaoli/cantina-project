import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useVendas() {
  return useQuery({
    queryKey: ["vendas"],
    queryFn: async () => {
      const [comprasRes, fichasRes] = await Promise.all([
        supabase.from("compras").select("*").order("data", { ascending: false }),
        supabase.from("fiadores").select("id, numero_ficha, nome_aluno"),
      ]);

      if (comprasRes.error) throw comprasRes.error;
      if (fichasRes.error) throw fichasRes.error;

      const fichaPorId = new Map(fichasRes.data.map((f) => [f.id, f]));

      return comprasRes.data.map((compra) => ({
        ...compra,
        ficha: fichaPorId.get(compra.fiador_id) ?? null,
      }));
    },
  });
}
