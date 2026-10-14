import { describe, it, expect } from "vitest";
import { codigoErro, divergenciasDoErro, mensagemErro } from "./errosBanco";

describe("errosBanco", () => {
  it("usa a mensagem do banco só para erros CFxxx", () => {
    const cf = { code: "CF001", message: "A ficha 001 tem fechamento em aberto; quite antes de excluir." };
    expect(mensagemErro(cf, "padrão")).toBe(cf.message);
    expect(mensagemErro({ code: "42501", message: "permission denied for table fiadores" }, "padrão")).toBe("padrão");
    expect(mensagemErro(new Error("rede"), "padrão")).toBe("padrão");
    expect(mensagemErro(null, "padrão")).toBe("padrão");
    expect(codigoErro(cf)).toBe("CF001");
    expect(codigoErro(undefined)).toBe("");
  });

  it("lê a lista de divergências atual do erro CF002", () => {
    const lista = [{ fiador_id: "a", saldo_atual: 13, saldo_razao: 10 }];
    expect(divergenciasDoErro({ code: "CF002", message: "…", details: JSON.stringify(lista) })).toEqual(lista);
    expect(divergenciasDoErro({ code: "CF002", message: "…", details: "texto" })).toBeNull();
    expect(divergenciasDoErro({ code: "CF003", message: "Período já fechado." })).toBeNull();
  });
});
