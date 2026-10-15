import { describe, it, expect } from "vitest";
import { validarAmbiente, type EnvEntrada } from "./ambiente";

const REF = "projetoref123";
const URL_OK = `https://${REF}.supabase.co`;

const env = (over: Partial<EnvEntrada>): EnvEntrada => ({
  VITE_SUPABASE_URL: URL_OK,
  VITE_SUPABASE_PUBLISHABLE_KEY: "chave",
  VITE_SUPABASE_PROJECT_ID: REF,
  ...over,
});

// variáveis apontadas como erradas
const variaveis = (e: EnvEntrada) => validarAmbiente(e).erros.map(x => x.variavel);
// todo o texto dos erros, para procurar trechos
const texto = (e: EnvEntrada) =>
  validarAmbiente(e).erros.map(x => `${x.variavel} ${x.problema} ${x.comoCorrigir}`).join(" ");

describe("validarAmbiente", () => {
  it("configurado corretamente → abre", () => {
    expect(validarAmbiente(env({}))).toEqual({
      ok: true,
      ambiente: { url: URL_OK, chave: "chave" },
      erros: [],
    });
  });

  it("VITE_SUPABASE_PROJECT_ID AUSENTE → abre normalmente (tolerado)", () => {
    expect(validarAmbiente(env({ VITE_SUPABASE_PROJECT_ID: undefined })).ok).toBe(true);
    expect(validarAmbiente(env({ VITE_SUPABASE_PROJECT_ID: "" })).ok).toBe(true);
  });

  it("VITE_SUPABASE_PROJECT_ID PRESENTE e DIFERENTE da URL → erro apontando essa variável", () => {
    expect(variaveis(env({ VITE_SUPABASE_PROJECT_ID: "outroprojeto" }))).toEqual(["VITE_SUPABASE_PROJECT_ID"]);
    expect(texto(env({ VITE_SUPABASE_PROJECT_ID: "outroprojeto" }))).toMatch(/apague essa variável/);
  });

  it("barra final na URL é aceita", () => {
    expect(validarAmbiente(env({ VITE_SUPABASE_URL: `${URL_OK}/` })).ok).toBe(true);
  });

  it("URL ou chave faltando → erro apontando a variável (em vez de tela em branco)", () => {
    expect(variaveis(env({ VITE_SUPABASE_URL: "" }))).toEqual(["VITE_SUPABASE_URL"]);
    expect(variaveis(env({ VITE_SUPABASE_PUBLISHABLE_KEY: undefined }))).toEqual(["VITE_SUPABASE_PUBLISHABLE_KEY"]);
  });

  it("URL com /rest/v1/ → erro", () => {
    expect(texto(env({ VITE_SUPABASE_URL: `${URL_OK}/rest/v1/` }))).toMatch(/sem \/rest\/v1\//);
  });

  it("http é aceito, como no supabase-js; outro protocolo ou URL inválida → erro", () => {
    expect(validarAmbiente(env({ VITE_SUPABASE_URL: `http://${REF}.supabase.co` })).ok).toBe(true);
    expect(texto(env({ VITE_SUPABASE_URL: "ftp://exemplo.com" }))).toMatch(/https:\/\//);
    expect(texto(env({ VITE_SUPABASE_URL: "não é url" }))).toMatch(/Não é uma URL válida/);
  });

  it("domínio personalizado do Supabase → abre, com ou sem PROJECT_ID", () => {
    const r = validarAmbiente(env({ VITE_SUPABASE_URL: "https://db.exemplo.com", VITE_SUPABASE_PROJECT_ID: "" }));
    expect(r.ok).toBe(true);
    expect(r.ambiente?.url).toBe("https://db.exemplo.com");
    expect(validarAmbiente(env({ VITE_SUPABASE_URL: "https://db.exemplo.com" })).ok).toBe(true);
  });

  it("domínio personalizado com caminho → erro (o supabase-js chamaria .../rest/v1/rest/v1)", () => {
    expect(texto(env({ VITE_SUPABASE_URL: "https://db.exemplo.com/rest/v1/" }))).toMatch(/sem \/rest\/v1\//);
  });

  it("todo erro diz qual variável, qual o problema e como corrigir (.env + reiniciar)", () => {
    const r = validarAmbiente({});
    expect(r.erros.length).toBeGreaterThan(0);
    for (const e of r.erros) {
      expect(e.variavel).toMatch(/^VITE_/);
      expect(e.problema.length).toBeGreaterThan(10);
      expect(e.comoCorrigir).toMatch(/\.env.*npm run dev/);
    }
  });
});
