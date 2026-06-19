ALTER TABLE "cards" ADD COLUMN "coluna_desde" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint
UPDATE "cards" SET "coluna_desde" = "atualizado_em";
--> statement-breakpoint
CREATE INDEX "cards_coluna_desde_idx" ON "cards" USING btree ("coluna_desde");
