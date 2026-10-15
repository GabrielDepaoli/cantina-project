import { createRoot } from "react-dom/client";
import "./index.css";
import { resultadoAmbiente } from "./config/ambiente";
import ErroConfiguracao from "./components/ErroConfiguracao";

const root = createRoot(document.getElementById("root")!);

// O App só é importado depois da validação: importá-lo antes executaria o
// client do Supabase, que quebra (tela em branco) se URL ou chave faltarem.
if (!resultadoAmbiente.ok || !resultadoAmbiente.ambiente) {
  root.render(<ErroConfiguracao erros={resultadoAmbiente.erros} />);
} else {
  import("./App.tsx")
    .then(({ default: App }) => root.render(<App />))
    .catch((erro: unknown) =>
      root.render(
        <ErroConfiguracao
          erros={[
            {
              variavel: "—",
              problema: `Falha ao carregar o app: ${erro instanceof Error ? erro.message : String(erro)}`,
              comoCorrigir:
                "Recarregue a página. Se persistir, veja o console do navegador e o terminal onde o npm run dev está rodando.",
            },
          ]}
        />,
      ),
    );
}
