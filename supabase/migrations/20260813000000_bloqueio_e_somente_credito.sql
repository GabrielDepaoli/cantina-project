
-- "Trancar conta": impede qualquer venda nova nessa ficha até ser destrancada,
-- independente de saldo/crédito.
-- "Somente crédito adicionado": a ficha só pode gastar o crédito que já foi
-- adicionado a ela (pagamento avulso) — não pode ficar devendo (saldo > 0).
ALTER TABLE public.fiadores
  ADD COLUMN bloqueada BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN somente_credito BOOLEAN NOT NULL DEFAULT false;
