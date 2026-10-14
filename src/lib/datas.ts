// Datas do fechamento. Colunas DATE do banco chegam como 'AAAA-MM-DD' e são
// formatadas pelo texto, sem passar por fuso (new Date('2026-06-06') seria
// meia-noite UTC = dia 5 à noite no Brasil). Timestamps usam o fuso da cantina.

const partes = (iso: string) => {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return { ano, mes, dia };
};

// '2026-06-06' → '06/06'
export const dataCurta = (iso: string) => {
  const { dia, mes } = partes(iso);
  return `${dia}/${mes}`;
};

// '2026-06-06' → '06/06/2026'
export const dataLonga = (iso: string) => {
  const { dia, mes, ano } = partes(iso);
  return `${dia}/${mes}/${ano}`;
};

// Período: '06/06–05/07' ou, longo, '06/06/2026–05/07/2026'.
export const intervalo = (inicio: string, fim: string, longo = false) =>
  longo ? `${dataLonga(inicio)}–${dataLonga(fim)}` : `${dataCurta(inicio)}–${dataCurta(fim)}`;

// Dia seguinte de uma DATE, em 'AAAA-MM-DD'.
export const diaSeguinte = (iso: string) => {
  const { ano, mes, dia } = partes(iso);
  const d = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia) + 1));
  return d.toISOString().slice(0, 10);
};

// Timestamp (timestamptz) → '06/06/2026' no fuso de São Paulo.
export const dataSp = (timestamp: string) =>
  new Date(timestamp).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

// Timestamp → '14:05' no fuso de São Paulo.
export const horaSp = (timestamp: Date | string) =>
  new Date(timestamp).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
