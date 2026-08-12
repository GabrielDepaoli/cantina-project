
-- Create fiadores table (guarantors/cards)
CREATE TABLE public.fiadores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_ficha TEXT NOT NULL UNIQUE,
  nome_responsavel TEXT NOT NULL,
  nome_aluno TEXT NOT NULL,
  telefone TEXT,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  saldo_atual NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create compras table (purchases)
CREATE TABLE public.compras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fiador_id UUID NOT NULL REFERENCES public.fiadores(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  data TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  mes_referencia TEXT NOT NULL,
  fechado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create fechamentos table (monthly closings)
CREATE TABLE public.fechamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fiador_id UUID NOT NULL REFERENCES public.fiadores(id) ON DELETE CASCADE,
  mes_referencia TEXT NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  data_pagamento TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(fiador_id, mes_referencia)
);

-- Enable RLS
ALTER TABLE public.fiadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechamentos ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read fiadores" ON public.fiadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert fiadores" ON public.fiadores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update fiadores" ON public.fiadores FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete fiadores" ON public.fiadores FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read compras" ON public.compras FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert compras" ON public.compras FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update compras" ON public.compras FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read fechamentos" ON public.fechamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert fechamentos" ON public.fechamentos FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_fiadores_updated_at
  BEFORE UPDATE ON public.fiadores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_compras_fiador_mes ON public.compras(fiador_id, mes_referencia);
CREATE INDEX idx_fechamentos_fiador_mes ON public.fechamentos(fiador_id, mes_referencia);
