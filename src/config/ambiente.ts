// Valida a configuração do Supabase (.env) ANTES de qualquer acesso ao banco.
// Se algo estiver errado, main.tsx mostra uma tela de erro dizendo qual
// variável corrigir, em vez de uma tela em branco.
//
// Só barra o que impediria o app de funcionar (URL/chave ausentes, URL que o
// supabase-js recusa ou com caminho) ou o que indica banco trocado
// (VITE_SUPABASE_PROJECT_ID presente e diferente da URL).
// - VITE_SUPABASE_PROJECT_ID AUSENTE é tolerado.
// - Domínio personalizado do Supabase (host que não é <ref>.supabase.co) é
//   aceito; nesse caso não há ref na URL para comparar.

export interface Ambiente {
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
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_PROJECT_ID?: string;
}

const ONDE_CONFIGURAR = "Corrija no arquivo .env, na pasta do projeto, e reinicie o npm run dev.";

export function validarAmbiente(env: EnvEntrada): ResultadoAmbiente {
  const erros: ErroAmbiente[] = [];
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

  // ref vinda da URL (só quando o host é <ref>.supabase.co). Com domínio
  // personalizado do Supabase, o host não revela a ref.
  let refDaUrl = "";
  let origem = "";
  if (url) {
    try {
      const u = new URL(url);
      // Mesma regra do supabase-js (validateSupabaseUrl): http ou https.
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        erros.push({
          variavel: "VITE_SUPABASE_URL",
          problema: `Precisa começar com https:// (valor atual: ${url}).`, // http:// também é aceito
          comoCorrigir: `Use a Project URL exatamente como aparece no Supabase (Settings → API). ${ONDE_CONFIGURAR}`,
        });
      } else {
        origem = u.origin;
        const m = u.hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
        if (m) refDaUrl = m[1];
      }
      // Uma URL com caminho não funciona: o supabase-js monta o endpoint com
      // new URL("rest/v1", url) e chamaria .../rest/v1/rest/v1. Barrar aqui não
      // derruba nenhuma configuração que funcione hoje.
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

  if (refDaUrl && projectId && refDaUrl !== projectId) {
    erros.push({
      variavel: "VITE_SUPABASE_PROJECT_ID",
      problema: `O valor (${projectId}) é de um projeto diferente do da URL (${refDaUrl}). A configuração está misturando dois bancos.`,
      comoCorrigir: `Deixe VITE_SUPABASE_PROJECT_ID igual a ${refDaUrl}, ou apague essa variável (ela é opcional). ${ONDE_CONFIGURAR}`,
    });
  }

  if (erros.length > 0) return { ok: false, ambiente: null, erros };
  return { ok: true, ambiente: { url: origem, chave }, erros: [] };
}

// Cast necessário: o tipo do Vite não declara as VITE_* e EnvEntrada só tem
// campos opcionais (o TypeScript recusa tipos sem nenhum campo em comum).
export const resultadoAmbiente = validarAmbiente(import.meta.env as EnvEntrada);

// Para componentes do app: só são carregados depois que a validação passou
// (ver main.tsx), então aqui o ambiente sempre existe.
export function ambienteAtual(): Ambiente {
  if (!resultadoAmbiente.ok || !resultadoAmbiente.ambiente) {
    const resumo = resultadoAmbiente.erros.map(e => `${e.variavel}: ${e.problema}`).join(" ");
    throw new Error(`Configuração do Supabase inválida. ${resumo}`);
  }
  return resultadoAmbiente.ambiente;
}
