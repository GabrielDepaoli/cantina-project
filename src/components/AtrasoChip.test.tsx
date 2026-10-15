import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AtrasoChip, { classeLinhaAtraso, nivelAtraso, textoAtraso } from "./AtrasoChip";

describe("AtrasoChip", () => {
  it("sem atraso não renderiza nada", () => {
    for (const atraso of [0, null, undefined]) {
      const { container } = render(<AtrasoChip atraso={atraso} />);
      expect(container).toBeEmptyDOMElement();
    }
  });

  it("escreve sempre o número, no singular e no plural", () => {
    expect(textoAtraso(1)).toBe("1 período em atraso");
    expect(textoAtraso(2)).toBe("2 períodos em atraso");
    render(<AtrasoChip atraso={5} />);
    expect(screen.getByText("5 períodos em atraso")).toBeInTheDocument();
  });

  it("nível 1 = amarelo, 2 = laranja, 3 ou mais = vermelho (pulando níveis)", () => {
    expect([1, 2, 3, 4, 12].map(nivelAtraso)).toEqual([1, 2, 3, 3, 3]);
    const { container } = render(<AtrasoChip atraso={4} />);
    expect(container.firstChild).toHaveClass("text-atraso-3-texto");
  });

  it("faixa da linha: vazia sem atraso e da cor do nível com atraso", () => {
    expect(classeLinhaAtraso(0)).toBe("");
    expect(classeLinhaAtraso(1)).toContain("border-l-atraso-1");
    expect(classeLinhaAtraso(2)).toContain("border-l-atraso-2");
    expect(classeLinhaAtraso(7)).toContain("border-l-atraso-3");
  });
});
