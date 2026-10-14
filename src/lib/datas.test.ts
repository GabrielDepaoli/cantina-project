import { describe, it, expect } from "vitest";
import { dataCurta, dataLonga, dataSp, diaSeguinte, intervalo } from "./datas";

describe("datas", () => {
  it("formata DATE do banco sem deslocar o dia por fuso", () => {
    expect(dataCurta("2026-06-06")).toBe("06/06");
    expect(dataLonga("2026-06-06")).toBe("06/06/2026");
    expect(intervalo("2026-06-06", "2026-07-05")).toBe("06/06–05/07");
    expect(intervalo("2026-06-06", "2026-07-05", true)).toBe("06/06/2026–05/07/2026");
  });

  it("dia seguinte atravessa mês, ano e fevereiro bissexto", () => {
    expect(diaSeguinte("2026-10-05")).toBe("2026-10-06");
    expect(diaSeguinte("2026-12-31")).toBe("2027-01-01");
    expect(diaSeguinte("2028-02-28")).toBe("2028-02-29");
    expect(diaSeguinte("2027-02-28")).toBe("2027-03-01");
  });

  it("timestamp usa o fuso de São Paulo", () => {
    // 02:00 UTC do dia 6 ainda é dia 5 em São Paulo (UTC−3)
    expect(dataSp("2026-06-06T02:00:00+00:00")).toBe("05/06/2026");
  });
});
