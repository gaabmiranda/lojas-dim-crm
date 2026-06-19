-- Remove duplicatas em pedido_itens mantendo apenas o menor id por (pedido_id, descricao, quantidade, valor_unitario).
-- Causadas por re-processamento do backfill antes da correção de idempotência.
DELETE FROM pedido_itens
WHERE id NOT IN (
  SELECT MIN(id)
  FROM pedido_itens
  GROUP BY pedido_id, descricao, quantidade, valor_unitario, valor_total
);
