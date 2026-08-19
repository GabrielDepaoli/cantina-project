
-- compras never had a DELETE policy (only SELECT/INSERT/UPDATE), so a wrong
-- purchase entry could never be removed. Mirrors the existing delete policy
-- already in place for fiadores.
CREATE POLICY "Authenticated users can delete compras" ON public.compras FOR DELETE TO authenticated USING (true);
