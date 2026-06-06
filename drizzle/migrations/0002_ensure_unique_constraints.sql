-- Garante UNIQUE CONSTRAINT em contatos.id_bling e pedidos.id_bling.
-- Idempotente: verifica pg_constraint antes de alterar.
-- ON CONFLICT DO UPDATE requer CONSTRAINT (não apenas INDEX) — PG 42P10.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contatos_id_bling_unique' AND conrelid = 'contatos'::regclass) THEN
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'contatos' AND indexname = 'contatos_id_bling_unique') THEN
            ALTER TABLE "contatos" ADD CONSTRAINT "contatos_id_bling_unique" UNIQUE USING INDEX "contatos_id_bling_unique";
        ELSE
            ALTER TABLE "contatos" ADD CONSTRAINT "contatos_id_bling_unique" UNIQUE ("id_bling");
        END IF;
    END IF;
END $$;
-->statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_id_bling_unique' AND conrelid = 'pedidos'::regclass) THEN
        IF EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'pedidos' AND indexname = 'pedidos_id_bling_unique') THEN
            ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_id_bling_unique" UNIQUE USING INDEX "pedidos_id_bling_unique";
        ELSE
            ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_id_bling_unique" UNIQUE ("id_bling");
        END IF;
    END IF;
END $$;
