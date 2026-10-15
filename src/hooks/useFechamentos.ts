import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useFichas, type Ficha } from "@/hooks/useFichas";
import type { DivergenciaConfirmada } from "@/lib/errosBanco";

// Hooks do fechamento de contas por período (docs/plano-fechamento.md, v6).
// Todas as chaves começam com "fechamento": invalidar ["fechamento"] atualiza
// tudo (pendentes, prévia, atrasos, histórico, configuração).
// As funções buscar* são exportadas sem React para poder testar no console.

export const FECHAMENTO_QUERY_KEY = ["fechamento"] as const;

export type Periodo = Tables<"periodos_fechamento">;
export type ItemFechamento = Tables<"fechamento_itens">;
export type DivergenciaRegistrada = Tables<"periodo_divergencias">;
export type Configuracao = Tables<"configuracao">;
export type TrocaDeDia = Tables<"configuracao_historico">;

export interface PeriodoProximo {
  ordem: number;
  data_inicio: string;
  data_fim: string;
  transicao: boolean;
  pendente: boolean;
}

export interface PreviaFechamento {
  data_inicio: string;
  data_fim: string;
  transicao: boolean;
  fichas: number;
  total: number;
}

export interface Divergencia extends DivergenciaConfirmada {
  numero_ficha: string;
  nome_aluno: string;
}

export interface PeriodoComItens extends Periodo {
  fechamento_itens: ItemFechamento[];
  periodo_divergencias: DivergenciaRegistrada[];
}

export interface Atraso {
  atraso: number;
  desde: string;
}

export interface FichaEmAtraso extends Atraso {
  ficha: Ficha;
}

export interface SimulacaoTrocaDia {
  dia_atual: number;
  dia_novo: number;
  mesmo_dia: boolean;
  pendentes: { data_inicio: string; data_fim: string; transicao: boolean }[];
  transicao_aberta: { dia_anterior: number; dia_novo: number; data_inicio: string; data_fim: string } | null;
  bloqueado: boolean;
  transicao_inicio: string | null;
  transicao_fim: string | null;
  dias: number | null;
  sem_transicao: boolean;
  aviso_curta: boolean;
}

// ----------------------------------------------------------------- buscas

export async function buscarProximosPeriodos(): Promise<PeriodoProximo[]> {
  const { data, error } = await supabase.rpc("proximos_periodos");
  if (error) throw error;
  return [...(data ?? [])].sort((a, b) => a.ordem - b.ordem);
}

export async function buscarPrevia(): Promise<PreviaFechamento | null> {
  const { data, error } = await supabase.rpc("previa_fechamento");
  if (error) throw error;
  const linha = data?.[0];
  return linha ? { ...linha, total: Number(linha.total) } : null;
}

export async function buscarDivergencias(): Promise<Divergencia[]> {
  const { data, error } = await supabase.rpc("verificar_divergencias");
  if (error) throw error;
  return (data ?? []).map((d) => ({ ...d, saldo_atual: Number(d.saldo_atual), saldo_razao: Number(d.saldo_razao) }));
}

export async function buscarPeriodos(): Promise<PeriodoComItens[]> {
  const { data, error } = await supabase
    .from("periodos_fechamento")
    .select("*, fechamento_itens(*), periodo_divergencias(*)")
    .order("data_inicio", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PeriodoComItens[];
}

export async function buscarAtrasos(): Promise<Map<string, Atraso>> {
  const { data, error } = await supabase.from("v_atraso_fichas").select("fiador_id, atraso, desde");
  if (error) throw error;
  const mapa = new Map<string, Atraso>();
  for (const linha of data ?? []) {
    if (linha.fiador_id && linha.atraso) mapa.set(linha.fiador_id, { atraso: linha.atraso, desde: linha.desde });
  }
  return mapa;
}

export async function buscarConfiguracao(): Promise<{ configuracao: Configuracao; historico: TrocaDeDia[] }> {
  const [configRes, historicoRes] = await Promise.all([
    supabase.from("configuracao").select("*").single(),
    supabase.from("configuracao_historico").select("*").order("id", { ascending: false }),
  ]);
  if (configRes.error) throw configRes.error;
  if (historicoRes.error) throw historicoRes.error;
  return { configuracao: configRes.data, historico: historicoRes.data ?? [] };
}

export async function simularTrocaDia(dia: number): Promise<SimulacaoTrocaDia> {
  const { data, error } = await supabase.rpc("simular_troca_dia", { p_dia: dia });
  if (error) throw error;
  return data as unknown as SimulacaoTrocaDia;
}

// ----------------------------------------------------------------- hooks de leitura

// Pendentes (já terminados, fecham um por clique do mais antigo) e o período
// em andamento (para o texto "próximo fechamento a partir de ...").
export function useProximosPeriodos() {
  const query = useQuery({ queryKey: [...FECHAMENTO_QUERY_KEY, "proximos"], queryFn: buscarProximosPeriodos });
  const periodos = query.data ?? [];
  return {
    ...query,
    pendentes: periodos.filter((p) => p.pendente),
    emAndamento: periodos.find((p) => !p.pendente) ?? null,
  };
}

export function usePreviaFechamento(enabled = true) {
  return useQuery({ queryKey: [...FECHAMENTO_QUERY_KEY, "previa"], queryFn: buscarPrevia, enabled });
}

// Conferência razão × saldo. Só leitura. Use enabled=false e refetch() para
// conferir sob demanda ("Conferir agora").
export function useDivergencias(enabled = true) {
  return useQuery({ queryKey: [...FECHAMENTO_QUERY_KEY, "divergencias"], queryFn: buscarDivergencias, enabled });
}

// Histórico: períodos fechados (mais recente primeiro) com itens e divergências.
export function usePeriodos() {
  return useQuery({ queryKey: [...FECHAMENTO_QUERY_KEY, "periodos"], queryFn: buscarPeriodos });
}

// Atraso por ficha (fiador_id → atraso). Ficha sem atraso não está no mapa.
export function useAtrasos() {
  return useQuery({ queryKey: [...FECHAMENTO_QUERY_KEY, "atrasos"], queryFn: buscarAtrasos });
}

// Fichas em atraso com os dados ao vivo (saldo, responsável, celular), do
// maior atraso para o menor. Base da lista "Em aberto" e de cobranças futuras.
export function useFichasEmAtraso() {
  const { data: fichas = [], isLoading: carregandoFichas } = useFichas();
  const { data: atrasos, isLoading: carregandoAtrasos } = useAtrasos();
  const lista = useMemo<FichaEmAtraso[]>(() => {
    if (!atrasos) return [];
    return fichas
      .filter((f) => atrasos.has(f.id))
      .map((f) => ({ ficha: f, ...atrasos.get(f.id)! }))
      .sort((a, b) => b.atraso - a.atraso || a.ficha.numero_ficha.localeCompare(b.ficha.numero_ficha));
  }, [fichas, atrasos]);
  return { data: lista, isLoading: carregandoFichas || carregandoAtrasos };
}

export function useConfiguracao() {
  return useQuery({ queryKey: [...FECHAMENTO_QUERY_KEY, "configuracao"], queryFn: buscarConfiguracao });
}

// Simulação da troca de dia. Só consulta quando o dia é válido (1–31).
export function useSimularTrocaDia(dia: number | null) {
  const valido = dia !== null && Number.isInteger(dia) && dia >= 1 && dia <= 31;
  return useQuery({
    queryKey: [...FECHAMENTO_QUERY_KEY, "simulacao", dia],
    queryFn: () => simularTrocaDia(dia as number),
    enabled: valido,
  });
}

// ----------------------------------------------------------------- hooks de escrita

interface FecharPeriodoInput {
  dataInicio: string;
  // A lista que o operador viu e confirmou; vazia quando não há divergência.
  divergenciasConfirmadas?: DivergenciaConfirmada[];
}

// Erros esperados (use codigoErro/mensagemErro/divergenciasDoErro):
// CF002 divergência mudou, CF003 já fechado, CF004 operações em andamento,
// CF005 nada a fechar, CF006 não é o próximo.
export function useFecharPeriodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ dataInicio, divergenciasConfirmadas = [] }: FecharPeriodoInput) => {
      const confirmadas = divergenciasConfirmadas.map(({ fiador_id, saldo_atual, saldo_razao }) => ({
        fiador_id,
        saldo_atual,
        saldo_razao,
      }));
      const { data, error } = await supabase.rpc("fechar_periodo", {
        p_data_inicio: dataInicio,
        p_divergencias_confirmadas: confirmadas,
      });
      if (error) throw error;
      return data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: FECHAMENTO_QUERY_KEY });
    },
  });
}

interface DefinirDiaInput {
  dia: number;
  confirmarAviso?: boolean;
}

// Erros esperados: CF008 pendentes, CF009 transição aberta, CF010 aviso de
// transição curta não confirmado, CF011 dia inválido, CF012 mesmo dia.
export function useDefinirDia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ dia, confirmarAviso = false }: DefinirDiaInput) => {
      const { data, error } = await supabase.rpc("definir_dia_fechamento", {
        p_dia: dia,
        p_confirmar_aviso: confirmarAviso,
      });
      if (error) throw error;
      return data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: FECHAMENTO_QUERY_KEY });
    },
  });
}
