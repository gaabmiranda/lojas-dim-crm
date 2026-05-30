CREATE TYPE "public"."coluna_card" AS ENUM('pendente', 'em_contato', 'finalizado', 'arquivo');--> statement-breakpoint
CREATE TYPE "public"."role_usuario" AS ENUM('admin', 'vendedor');--> statement-breakpoint
CREATE TYPE "public"."status_atividade" AS ENUM('pendente', 'em_andamento', 'concluida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."tipo_card" AS ENUM('pos_venda', 'reativacao');--> statement-breakpoint
CREATE TABLE "atividades" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"data_agendada" timestamp with time zone NOT NULL,
	"status" "status_atividade" DEFAULT 'pendente' NOT NULL,
	"vendedor_id" integer,
	"executada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bling_tokens" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"access_expires_at" timestamp with time zone NOT NULL,
	"refresh_expires_at" timestamp with time zone NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bling_tokens_singleton" CHECK ("bling_tokens"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"contato_id" integer NOT NULL,
	"pedido_id_origem" integer,
	"tipo" "tipo_card" NOT NULL,
	"coluna" "coluna_card" DEFAULT 'pendente' NOT NULL,
	"nome_exibido" text NOT NULL,
	"tentativas_reativacao" smallint DEFAULT 0 NOT NULL,
	"data_prevista_acao" timestamp with time zone,
	"vendedor_id" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comentarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"texto" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contatos" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"nome" text NOT NULL,
	"telefone" text,
	"email" text,
	"situacao_bling" text,
	"dados_extras_json" jsonb,
	"freezing_ate" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer,
	"contato_id" integer,
	"tipo" text NOT NULL,
	"origem" text NOT NULL,
	"external_id" text,
	"payload_json" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notificacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"link" text,
	"lida" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedido_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"pedido_id" integer NOT NULL,
	"descricao" text NOT NULL,
	"quantidade" numeric(14, 4),
	"valor_unitario" numeric(14, 2),
	"valor_total" numeric(14, 2)
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"contato_id" integer NOT NULL,
	"numero" text,
	"data" date,
	"data_saida" date,
	"situacao_id" integer,
	"situacao_valor" smallint,
	"total" numeric(14, 2),
	"total_produtos" numeric(14, 2),
	"dados_completos_json" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates_mensagem" (
	"key" text PRIMARY KEY NOT NULL,
	"descricao" text,
	"conteudo" text NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"nome" text,
	"role" "role_usuario" DEFAULT 'vendedor' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"telefone" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_vendedor_id_usuarios_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_pedido_id_origem_pedidos_id_fk" FOREIGN KEY ("pedido_id_origem") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_vendedor_id_usuarios_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atividades_status_data_idx" ON "atividades" USING btree ("status","data_agendada");--> statement-breakpoint
CREATE INDEX "atividades_card_idx" ON "atividades" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "cards_coluna_data_idx" ON "cards" USING btree ("coluna","data_prevista_acao");--> statement-breakpoint
CREATE INDEX "cards_contato_idx" ON "cards" USING btree ("contato_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cards_contato_ativo_unique" ON "cards" USING btree ("contato_id") WHERE "cards"."coluna" != 'arquivo';--> statement-breakpoint
CREATE UNIQUE INDEX "contatos_id_bling_unique" ON "contatos" USING btree ("id_bling");--> statement-breakpoint
CREATE INDEX "contatos_freezing_ate_idx" ON "contatos" USING btree ("freezing_ate");--> statement-breakpoint
CREATE INDEX "contatos_nome_idx" ON "contatos" USING btree ("nome");--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_origem_external_unique" ON "eventos" USING btree ("origem","external_id") WHERE "eventos"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "eventos_card_idx" ON "eventos" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "eventos_criado_idx" ON "eventos" USING btree ("criado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notificacoes_usuario_lida_idx" ON "notificacoes" USING btree ("usuario_id","lida","criado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_id_bling_unique" ON "pedidos" USING btree ("id_bling");--> statement-breakpoint
CREATE INDEX "pedidos_contato_data_idx" ON "pedidos" USING btree ("contato_id","data" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pedidos_situacao_valor_idx" ON "pedidos" USING btree ("situacao_valor");