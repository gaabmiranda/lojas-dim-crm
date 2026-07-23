ALTER TYPE "public"."tipo_card" ADD VALUE 'aniversario';
--> statement-breakpoint
ALTER TYPE "public"."coluna_card" ADD VALUE 'pausado';
--> statement-breakpoint
DROP INDEX IF EXISTS "cards_contato_ativo_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "cards_contato_ativo_unique" ON "cards" ("contato_id") WHERE coluna NOT IN ('arquivo', 'pausado');
--> statement-breakpoint
ALTER TABLE "contatos" ADD COLUMN "data_aniversario" date;
--> statement-breakpoint
CREATE INDEX "contatos_aniversario_idx" ON "contatos" (EXTRACT(MONTH FROM data_aniversario), EXTRACT(DAY FROM data_aniversario)) WHERE data_aniversario IS NOT NULL;
