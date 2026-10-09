// Identifica em qual banco o app está conectado (produção ou staging) e barra
// configurações perigosas ANTES de qualquer acesso ao Supabase.
//
// O banco é deduzido da URL real, não de uma flag que alguém possa esquecer.
// A ref de produção é pública (já está versionada em supabase/config.toml e
// vai dentro da URL embutida no bundle): não é credencial.
//
// Regras para produção (npm run dev, build e deploy): só barra o que impediria
// o app de funcionar (URL/chave ausentes ou malformadas) ou o que indica banco
// trocado (VITE_SUPABASE_PROJECT_ID presente e diferente da URL).
// VITE_SUPABASE_PROJECT_ID AUSENTE é tolerado. Em modo staging ela é obrigatória.
export const REF_PRODUCAO = "yqhiazfknioaxlyzobrz";

export interface Ambiente {
  tipo: "producao" | "staging";
  ref: string;
  url: string;
  chave: string;
}

export interface ErroAmbiente {
  variavel: string; // qual variável está errada (ou "—" quando não é uma variável)
  problema: string; // o que está errado, em uma frase
  comoCorrigir: string; // o que quem cuida do sistema precisa fazer
}

// Formato simples, sem união discriminada: o projeto roda com strict: false,
// e nesse modo o TypeScript não estreita uniões por `!resultado.ok`.
export interface ResultadoAmbiente {
  ok: boolean;
  ambiente: Ambiente | null; // preenchido só quando ok
  erros: ErroAmbiente[]; // vazio quando ok
}

export interface EnvEntrada {
  MODE: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_PROJECT_ID?: string;
}

const ONDE_CONFIGURAR =
  "Corrija no arquivo .env (produção local), no .env.staging.local (staging) ou nas variáveis de ambiente da hospedagem, e reinicie/republique o app.";

export function validarAmbiente(env: EnvEntrada): ResultadoAmbiente {
  const erros: ErroAmbiente[] = [];
  const modoStaging = env.MODE === "staging";
  const url = (env.VITE_SUPABASE_URL ?? "").trim();
  const chave = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const projectId = (env.VITE_SUPABASE_PROJECT_ID ?? "").trim();

  if (!url) {
    erros.push({
      variavel: "VITE_SUPABASE_URL",
      problema: "Não está definida. Sem ela o app não sabe qual banco usar.",
      comoCorrigir: `Defina com a Project URL do Supabase (Settings → API), no formato https://<ref>.supabase.co. ${ONDE_CONFIGURAR}`,
    });
  }
  if (!chave) {
    erros.push({
      variavel: "VITE_SUPABASE_PUBLISHABLE_KEY",
      problema: "Não está definida. Sem ela o app não consegue acessar o banco.",
      comoCorrigir: `Defina com a chave anon/publishable do Supabase (Settings → API). ${ONDE_CONFIGURAR}`,
    });
  }
  // Em staging o project id é obrigatório: é ele que denuncia um arquivo de
  // staging incompleto herdando valores de produção do .env.
  if (modoStaging && !projectId) {
    erros.push({
      variavel: "VITE_SUPABASE_PROJECT_ID",
      problema: "Não está definida, e ela é obrigatória em modo staging (npm run dev:staging).",
      comoCorrigir: "Coloque no .env.staging.local a ref do projeto de staging (o subdomínio da URL de staging).",
    });
  }

  let ref = "";
  let origem = "";
  if (url) {
    try {
      const u = new URL(url);
      const m = u.hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
      if (u.protocol !== "https:" || !m) {
        erros.push({
          variavel: "VITE_SUPABASE_URL",
          problema: `Não está no formato https://<ref>.supabase.co (valor atual: ${url}).`,
          comoCorrigir: `Use a Project URL exatamente como aparece no Supabase (Settings → API). ${ONDE_CONFIGURAR}`,
        });
      } else {
        ref = m[1];
        origem = u.origin;
      }
      if (u.pathname !== "/" || u.search || u.hash) {
        erros.push({
          variavel: "VITE_SUPABASE_URL",
          problema: `Tem um caminho depois do domínio (valor atual: ${url}).`,
          comoCorrigir: `Deixe só a URL base, sem /rest/v1/ nem nada depois de .supabase.co. ${ONDE_CONFIGURAR}`,
        });
      }
    } catch {
      erros.push({
        variavel: "VITE_SUPABASE_URL",
        problema: `Não é uma URL válida (valor atual: ${url}).`,
        comoCorrigir: `Use a Project URL do Supabase (Settings → API). ${ONDE_CONFIGURAR}`,
      });
    }
  }

  if (ref && projectId && ref !== projectId) {
    erros.push({
      variavel: "VITE_SUPABASE_PROJECT_ID",
      problema: `O valor (${projectId}) é de um projeto diferente do da URL (${ref}). A configuração está misturando dois bancos.`,
      comoCorrigir: `Deixe VITE_SUPABASE_PROJECT_ID igual a ${ref}, ou apague essa variável (em produção ela é opcional). ${ONDE_CONFIGURAR}`,
    });
  }

  if (modoStaging && ref === REF_PRODUCAO) {
    erros.push({
      variavel: "VITE_SUPABASE_URL",
      problema: "O app foi iniciado em modo staging (npm run dev:staging), mas a URL aponta para o banco de PRODUÇÃO.",
      comoCorrigir:
        "Provavelmente falta VITE_SUPABASE_URL no .env.staging.local e o valor de produção do .env foi herdado. Preencha as cinco variáveis no .env.staging.local (ver supabase/staging/LEIAME.md).",
    });
  }

  if (erros.length > 0) return { ok: false, ambiente: null, erros };
  return {
    ok: true,
    ambiente: { tipo: ref === REF_PRODUCAO ? "producao" : "staging", ref, url: origem, chave },
    erros: [],
  };
}

export const resultadoAmbiente = validarAmbiente(import.meta.env);

// Para componentes do app: só são carregados depois que a validação passou
// (ver main.tsx), então aqui o ambiente sempre existe.
export function ambienteAtual(): Ambiente {
  if (!resultadoAmbiente.ok || !resultadoAmbiente.ambiente) {
    const resumo = resultadoAmbiente.erros.map(e => `${e.variavel}: ${e.problema}`).join(" ");
    throw new Error(`Configuração do Supabase inválida. ${resumo}`);
  }
  return resultadoAmbiente.ambiente;
}
