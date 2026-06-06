-- Promove os UNIQUE INDEX existentes para UNIQUE CONSTRAINT.
-- ON CONFLICT DO UPDATE requer CONSTRAINT, não apenas INDEX (PG 42P10).
ALTER TABLE "contatos" ADD CONSTRAINT "contatos_id_bling_unique" UNIQUE USING INDEX "contatos_id_bling_unique";
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_id_bling_unique" UNIQUE USING INDEX "pedidos_id_bling_unique";
