CREATE TABLE "categorias_financeiras" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"descricao" text NOT NULL,
	"tipo" text,
	"situacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorias_produtos" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"descricao" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contas_pagar" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"fornecedor_id" integer,
	"fornecedor_id_bling" bigint,
	"situacao" text,
	"vencimento" date,
	"vencimento_original" date,
	"valor" numeric(14, 2),
	"saldo" numeric(14, 2),
	"historico" text,
	"numero_banco" text,
	"categoria_id_bling" bigint,
	"dados_json" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contas_receber" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"contato_id" integer,
	"contato_id_bling" bigint,
	"situacao" text,
	"vencimento" date,
	"vencimento_original" date,
	"valor" numeric(14, 2),
	"saldo" numeric(14, 2),
	"historico" text,
	"numero_banco" text,
	"categoria_id_bling" bigint,
	"dados_json" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "depositos" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"descricao" text NOT NULL,
	"situacao" text,
	"padrao" boolean DEFAULT false,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estoques" (
	"id" serial PRIMARY KEY NOT NULL,
	"produto_id" integer,
	"produto_id_bling" bigint NOT NULL,
	"deposito_id_bling" bigint,
	"deposito_nome" text,
	"saldo_virtual" numeric(14, 4),
	"saldo_fisico" numeric(14, 4),
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formas_pagamento" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"descricao" text NOT NULL,
	"tipo_pagamento" smallint,
	"situacao" text,
	"padrao" boolean DEFAULT false,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logisticas" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"nome" text NOT NULL,
	"tipo" text,
	"situacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logisticas_remessas" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"situacao" text,
	"codigo_rastreio" text,
	"pedido_id_bling" bigint,
	"pedido_id" integer,
	"logistica_id_bling" bigint,
	"dados_json" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "naturezas_operacao" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"descricao" text NOT NULL,
	"tipo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nfce" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"numero" text,
	"serie" text,
	"situacao" smallint,
	"data_emissao" date,
	"valor_total" numeric(14, 2),
	"chave" text,
	"dados_json" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nfe" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"numero" text,
	"serie" text,
	"situacao" smallint,
	"data_emissao" date,
	"contato_id_bling" bigint,
	"contato_id" integer,
	"valor_total" numeric(14, 2),
	"chave" text,
	"dados_json" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos_compra" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"fornecedor_id" integer,
	"fornecedor_id_bling" bigint,
	"numero" text,
	"data" date,
	"situacao_valor" smallint,
	"total" numeric(14, 2),
	"dados_json" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos_compra_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"pedido_compra_id" integer NOT NULL,
	"produto_id_bling" bigint,
	"descricao" text NOT NULL,
	"quantidade" numeric(14, 4),
	"valor_unitario" numeric(14, 2),
	"valor_total" numeric(14, 2)
);
--> statement-breakpoint
CREATE TABLE "produto_variacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"produto_id" integer,
	"produto_id_bling" bigint NOT NULL,
	"nome" text,
	"codigo" text,
	"preco" numeric(14, 2),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"nome" text NOT NULL,
	"codigo" text,
	"tipo" text,
	"situacao" text,
	"preco" numeric(14, 2),
	"preco_custo" numeric(14, 2),
	"unidade" text,
	"categoria_id_bling" bigint,
	"dados_json" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendedores_bling" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_bling" bigint NOT NULL,
	"contato_id_bling" bigint,
	"contato_nome" text,
	"comissao" numeric(5, 2),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_fornecedor_id_contatos_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoques" ADD CONSTRAINT "estoques_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logisticas_remessas" ADD CONSTRAINT "logisticas_remessas_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe" ADD CONSTRAINT "nfe_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_fornecedor_id_contatos_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."contatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_compra_itens" ADD CONSTRAINT "pedidos_compra_itens_pedido_compra_id_pedidos_compra_id_fk" FOREIGN KEY ("pedido_compra_id") REFERENCES "public"."pedidos_compra"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto_variacoes" ADD CONSTRAINT "produto_variacoes_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_financeiras_id_bling_unique" ON "categorias_financeiras" USING btree ("id_bling");--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_produtos_id_bling_unique" ON "categorias_produtos" USING btree ("id_bling");--> statement-breakpoint
CREATE UNIQUE INDEX "contas_pagar_id_bling_unique" ON "contas_pagar" USING btree ("id_bling");--> statement-breakpoint
CREATE INDEX "contas_pagar_vencimento_idx" ON "contas_pagar" USING btree ("vencimento");--> statement-breakpoint
CREATE INDEX "contas_pagar_situacao_idx" ON "contas_pagar" USING btree ("situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "contas_receber_id_bling_unique" ON "contas_receber" USING btree ("id_bling");--> statement-breakpoint
CREATE INDEX "contas_receber_vencimento_idx" ON "contas_receber" USING btree ("vencimento");--> statement-breakpoint
CREATE INDEX "contas_receber_situacao_idx" ON "contas_receber" USING btree ("situacao");--> statement-breakpoint
CREATE INDEX "contas_receber_contato_idx" ON "contas_receber" USING btree ("contato_id");--> statement-breakpoint
CREATE UNIQUE INDEX "depositos_id_bling_unique" ON "depositos" USING btree ("id_bling");--> statement-breakpoint
CREATE UNIQUE INDEX "estoques_produto_deposito_unique" ON "estoques" USING btree ("produto_id_bling","deposito_id_bling");--> statement-breakpoint
CREATE INDEX "estoques_produto_idx" ON "estoques" USING btree ("produto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "formas_pagamento_id_bling_unique" ON "formas_pagamento" USING btree ("id_bling");--> statement-breakpoint
CREATE UNIQUE INDEX "logisticas_id_bling_unique" ON "logisticas" USING btree ("id_bling");--> statement-breakpoint
CREATE UNIQUE INDEX "logisticas_remessas_id_bling_unique" ON "logisticas_remessas" USING btree ("id_bling");--> statement-breakpoint
CREATE INDEX "logisticas_remessas_pedido_idx" ON "logisticas_remessas" USING btree ("pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "naturezas_operacao_id_bling_unique" ON "naturezas_operacao" USING btree ("id_bling");--> statement-breakpoint
CREATE UNIQUE INDEX "nfce_id_bling_unique" ON "nfce" USING btree ("id_bling");--> statement-breakpoint
CREATE INDEX "nfce_data_emissao_idx" ON "nfce" USING btree ("data_emissao" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "nfe_id_bling_unique" ON "nfe" USING btree ("id_bling");--> statement-breakpoint
CREATE INDEX "nfe_data_emissao_idx" ON "nfe" USING btree ("data_emissao" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "nfe_situacao_idx" ON "nfe" USING btree ("situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_compra_id_bling_unique" ON "pedidos_compra" USING btree ("id_bling");--> statement-breakpoint
CREATE INDEX "pedidos_compra_data_idx" ON "pedidos_compra" USING btree ("data" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "produto_variacoes_id_bling_unique" ON "produto_variacoes" USING btree ("id_bling");--> statement-breakpoint
CREATE INDEX "produto_variacoes_produto_idx" ON "produto_variacoes" USING btree ("produto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_id_bling_unique" ON "produtos" USING btree ("id_bling");--> statement-breakpoint
CREATE INDEX "produtos_nome_idx" ON "produtos" USING btree ("nome");--> statement-breakpoint
CREATE INDEX "produtos_codigo_idx" ON "produtos" USING btree ("codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "vendedores_bling_id_bling_unique" ON "vendedores_bling" USING btree ("id_bling");