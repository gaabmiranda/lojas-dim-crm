ALTER TYPE "public"."tipo_card" ADD VALUE IF NOT EXISTS 'aniversario';
--> statement-breakpoint
ALTER TYPE "public"."coluna_card" ADD VALUE IF NOT EXISTS 'pausado';
--> statement-breakpoint
DROP INDEX IF EXISTS "cards_contato_ativo_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cards_contato_ativo_unique" ON "cards" ("contato_id") WHERE coluna NOT IN ('arquivo', 'pausado');
--> statement-breakpoint
ALTER TABLE "contatos" ADD COLUMN IF NOT EXISTS "data_aniversario" date;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contatos_aniversario_idx" ON "contatos" (EXTRACT(MONTH FROM data_aniversario), EXTRACT(DAY FROM data_aniversario)) WHERE data_aniversario IS NOT NULL;
