import { describe, it, expect } from "vitest";
import { validarAmbiente, REF_PRODUCAO, type EnvEntrada } from "./ambiente";

const URL_PROD = `https://${REF_PRODUCAO}.supabase.co`;
const REF_STG = "stagingref123";
const URL_STG = `https://${REF_STG}.supabase.co`;

const env = (over: Partial<EnvEntrada>): EnvEntrada => ({
  MODE: "production",
  VITE_SUPABASE_URL: URL_PROD,
  VITE_SUPABASE_PUBLISHABLE_KEY: "chave",
  VITE_SUPABASE_PROJECT_ID: REF_PRODUCAO,
  ...over,
});

// variáveis apontadas como erradas
const variaveis = (e: EnvEntrada) => validarAmbiente(e).erros.map(x => x.variavel);
// todo o texto dos erros, para procurar trechos
const texto = (e: EnvEntrada) =>
  validarAmbiente(e).erros.map(x => `${x.variavel} ${x.problema} ${x.comoCorrigir}`).join(" ");

describe("validarAmbiente — produção (deploy)", () => {
  it("configurada corretamente → abre como producao", () => {
    const r = validarAmbiente(env({}));
    expect(r).toEqual({
      ok: true,
      ambiente: { tipo: "producao", ref: REF_PRODUCAO, url: URL_PROD, chave: "chave" },
      erros: [],
    });
  });

  it("VITE_SUPABASE_PROJECT_ID AUSENTE → abre normalmente (tolerado)", () => {
    expect(validarAmbiente(env({ VITE_SUPABASE_PROJECT_ID: undefined })).ok).toBe(true);
    expect(validarAmbiente(env({ VITE_SUPABASE_PROJECT_ID: "" })).ok).toBe(true);
    expect(validarAmbiente(env({ MODE: "development", VITE_SUPABASE_PROJECT_ID: undefined })).ok).toBe(true);
  });

  it("VITE_SUPABASE_PROJECT_ID PRESENTE e DIFERENTE da URL → erro apontando essa variável", () => {
    expect(variaveis(env({ VITE_SUPABASE_PROJECT_ID: "outroprojeto" }))).toEqual(["VITE_SUPABASE_PROJECT_ID"]);
    expect(texto(env({ VITE_SUPABASE_PROJECT_ID: "outroprojeto" }))).toMatch(/apague essa variável/);
  });

  it("barra final na URL é aceita", () => {
    expect(validarAmbiente(env({ VITE_SUPABASE_URL: `${URL_PROD}/` })).ok).toBe(true);
  });

  it("URL ou chave faltando → erro apontando a variável (em vez de tela em branco)", () => {
    expect(variaveis(env({ VITE_SUPABASE_URL: "" }))).toEqual(["VITE_SUPABASE_URL"]);
    expect(variaveis(env({ VITE_SUPABASE_PUBLISHABLE_KEY: undefined }))).toEqual(["VITE_SUPABASE_PUBLISHABLE_KEY"]);
  });

  it("URL com /rest/v1/ → erro", () => {
    expect(texto(env({ VITE_SUPABASE_URL: `${URL_PROD}/rest/v1/` }))).toMatch(/sem \/rest\/v1\//);
  });

  it("URL fora do formato do Supabase → erro", () => {
    expect(texto(env({ VITE_SUPABASE_URL: "http://localhost:54321" }))).toMatch(/formato/);
    expect(texto(env({ VITE_SUPABASE_URL: "não é url" }))).toMatch(/Não é uma URL válida/);
  });

  it("todo erro diz qual variável, qual o problema e como corrigir", () => {
    const r = validarAmbiente({ MODE: "staging" });
    expect(r.erros.length).toBeGreaterThan(0);
    for (const e of r.erros) {
      expect(e.variavel).toMatch(/^VITE_/);
      expect(e.problema.length).toBeGreaterThan(10);
      expect(e.comoCorrigir.length).toBeGreaterThan(10);
    }
  });
});

describe("validarAmbiente — staging (npm run dev:staging)", () => {
  it("configurado corretamente → abre como staging", () => {
    const r = validarAmbiente(env({ MODE: "staging", VITE_SUPABASE_URL: URL_STG, VITE_SUPABASE_PROJECT_ID: REF_STG }));
    expect(r.ok).toBe(true);
    expect(r.ambiente?.tipo).toBe("staging");
  });

  it("herdando a URL de produção → erro", () => {
    expect(texto(env({ MODE: "staging" }))).toMatch(/PRODUÇÃO/);
  });

  it("URL de staging mas PROJECT_ID herdado de produção → erro", () => {
    expect(variaveis(env({ MODE: "staging", VITE_SUPABASE_URL: URL_STG }))).toEqual(["VITE_SUPABASE_PROJECT_ID"]);
  });

  it("sem PROJECT_ID → erro (obrigatória só neste modo)", () => {
    expect(texto(env({ MODE: "staging", VITE_SUPABASE_URL: URL_STG, VITE_SUPABASE_PROJECT_ID: "" }))).toMatch(
      /obrigatória em modo staging/,
    );
  });
});
