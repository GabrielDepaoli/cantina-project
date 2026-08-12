// Exibe o saldo de uma ficha: quando ela deve dinheiro (saldo_atual > 0), com
// "-" antes do valor; quando está em crédito (pagou a mais, saldo_atual < 0),
// mostra o valor positivo com "(CRÉDITO)" ao lado.
export function formatSaldo(saldo: number): string {
  if (saldo > 0) return `-R$ ${saldo.toFixed(2)}`;
  if (saldo < 0) return `R$ ${Math.abs(saldo).toFixed(2)} (CRÉDITO)`;
  return `R$ ${saldo.toFixed(2)}`;
}
