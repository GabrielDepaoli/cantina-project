import SecaoDiaFechamento from "./SecaoDiaFechamento";
import SecaoIntegridade from "./SecaoIntegridade";

// Tela de Configurações (ícone de engrenagem no header, fora da nav principal).
// Pode reunir outras configurações no futuro (ex.: dados da cantina).
interface TelaConfiguracoesProps {
  onIrParaFechamento: () => void;
}

const TelaConfiguracoes = ({ onIrParaFechamento }: TelaConfiguracoesProps) => (
  <div className="space-y-4">
    <h2 className="text-xl font-bold text-foreground">Configurações</h2>
    <SecaoDiaFechamento onIrParaFechamento={onIrParaFechamento} />
    <SecaoIntegridade />
  </div>
);

export default TelaConfiguracoes;
