import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─── Enums ─────────────────────────────────────────────────────────────────
export const tipoCardEnum = pgEnum('tipo_card', ['pos_venda', 'reativacao']);
export const colunaCardEnum = pgEnum('coluna_card', [
  'pendente',
  'em_contato',
  'finalizado',
  'arquivo',
]);
export const statusAtividadeEnum = pgEnum('status_atividade', [
  'pendente',
  'em_andamento',
  'concluida',
  'cancelada',
]);
export const roleUsuarioEnum = pgEnum('role_usuario', ['admin', 'vendedor']);

// ─── Contatos ──────────────────────────────────────────────────────────────
// Bling = source of truth. id_bling é unique. situacao_bling: A|E|I|S (pegadinha #6).
export const contatos = pgTable(
  'contatos',
  {
    id: serial('id').primaryKey(),
    idBling: bigint('id_bling', { mode: 'number' }).notNull(),
    nome: text('nome').notNull(),
    telefone: text('telefone'),
    email: text('email'),
    situacaoBling: text('situacao_bling'),
    dadosExtrasJson: jsonb('dados_extras_json'),
    freezingAte: timestamp('freezing_ate', { withTimezone: true, mode: 'date' }),
    criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idBlingUnique: uniqueIndex('contatos_id_bling_unique').on(t.idBling),
    freezingAteIdx: index('contatos_freezing_ate_idx').on(t.freezingAte),
    nomeIdx: index('contatos_nome_idx').on(t.nome),
  }),
);

// ─── Pedidos ───────────────────────────────────────────────────────────────
export const pedidos = pgTable(
  'pedidos',
  {
    id: serial('id').primaryKey(),
    idBling: bigint('id_bling', { mode: 'number' }).notNull(),
    contatoId: integer('contato_id')
      .notNull()
      .references(() => contatos.id),
    numero: text('numero'),
    data: date('data', { mode: 'date' }),
    dataSaida: date('data_saida', { mode: 'date' }),
    situacaoId: integer('situacao_id'),
    situacaoValor: smallint('situacao_valor'),
    total: numeric('total', { precision: 14, scale: 2 }),
    totalProdutos: numeric('total_produtos', { precision: 14, scale: 2 }),
    dadosCompletosJson: jsonb('dados_completos_json'),
    criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idBlingUnique: uniqueIndex('pedidos_id_bling_unique').on(t.idBling),
    contatoDataIdx: index('pedidos_contato_data_idx').on(t.contatoId, t.data.desc()),
    situacaoIdx: index('pedidos_situacao_valor_idx').on(t.situacaoValor),
  }),
);

// ─── Pedido itens ──────────────────────────────────────────────────────────
export const pedidoItens = pgTable('pedido_itens', {
  id: serial('id').primaryKey(),
  pedidoId: integer('pedido_id')
    .notNull()
    .references(() => pedidos.id, { onDelete: 'cascade' }),
  descricao: text('descricao').notNull(),
  quantidade: numeric('quantidade', { precision: 14, scale: 4 }),
  valorUnitario: numeric('valor_unitario', { precision: 14, scale: 2 }),
  valorTotal: numeric('valor_total', { precision: 14, scale: 2 }),
});

// ─── Usuários ──────────────────────────────────────────────────────────────
export const usuarios = pgTable('usuarios', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  senhaHash: text('senha_hash').notNull(),
  nome: text('nome'),
  role: roleUsuarioEnum('role').notNull().default('vendedor'),
  ativo: boolean('ativo').notNull().default(true),
  telefone: text('telefone'),
  criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

// ─── Cards ─────────────────────────────────────────────────────────────────
// Unique partial index: contato_id WHERE coluna != 'arquivo' — invariante de 1 card ativo por contato.
export const cards = pgTable(
  'cards',
  {
    id: serial('id').primaryKey(),
    contatoId: integer('contato_id')
      .notNull()
      .references(() => contatos.id),
    pedidoIdOrigem: integer('pedido_id_origem').references(() => pedidos.id),
    tipo: tipoCardEnum('tipo').notNull(),
    coluna: colunaCardEnum('coluna').notNull().default('pendente'),
    nomeExibido: text('nome_exibido').notNull(),
    tentativasReativacao: smallint('tentativas_reativacao').notNull().default(0),
    dataPrevistaAcao: timestamp('data_prevista_acao', {
      withTimezone: true,
      mode: 'date',
    }),
    vendedorId: integer('vendedor_id').references(() => usuarios.id),
    criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    colunaDataIdx: index('cards_coluna_data_idx').on(t.coluna, t.dataPrevistaAcao),
    contatoIdx: index('cards_contato_idx').on(t.contatoId),
    // Partial unique: 1 card ativo por contato (coluna != 'arquivo')
    contatoAtivoUnique: uniqueIndex('cards_contato_ativo_unique')
      .on(t.contatoId)
      .where(sql`${t.coluna} != 'arquivo'`),
  }),
);

// ─── Atividades ────────────────────────────────────────────────────────────
export const atividades = pgTable(
  'atividades',
  {
    id: serial('id').primaryKey(),
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    tipo: text('tipo').notNull(),
    titulo: text('titulo').notNull(),
    descricao: text('descricao'),
    dataAgendada: timestamp('data_agendada', { withTimezone: true, mode: 'date' }).notNull(),
    status: statusAtividadeEnum('status').notNull().default('pendente'),
    vendedorId: integer('vendedor_id').references(() => usuarios.id),
    executadaEm: timestamp('executada_em', { withTimezone: true, mode: 'date' }),
    criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusDataIdx: index('atividades_status_data_idx').on(t.status, t.dataAgendada),
    cardIdx: index('atividades_card_idx').on(t.cardId),
  }),
);

// ─── Eventos (log de auditoria + idempotência) ─────────────────────────────
// (origem, external_id) unique → garante idempotência de webhooks/crons (Spec decisão #10).
export const eventos = pgTable(
  'eventos',
  {
    id: serial('id').primaryKey(),
    cardId: integer('card_id').references(() => cards.id),
    contatoId: integer('contato_id').references(() => contatos.id),
    tipo: text('tipo').notNull(),
    origem: text('origem').notNull(),
    externalId: text('external_id'),
    payloadJson: jsonb('payload_json'),
    criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    origemExternalUnique: uniqueIndex('eventos_origem_external_unique')
      .on(t.origem, t.externalId)
      .where(sql`${t.externalId} IS NOT NULL`),
    cardIdx: index('eventos_card_idx').on(t.cardId),
    criadoIdx: index('eventos_criado_idx').on(t.criadoEm.desc()),
  }),
);

// ─── Comentários ───────────────────────────────────────────────────────────
export const comentarios = pgTable('comentarios', {
  id: serial('id').primaryKey(),
  cardId: integer('card_id')
    .notNull()
    .references(() => cards.id, { onDelete: 'cascade' }),
  usuarioId: integer('usuario_id')
    .notNull()
    .references(() => usuarios.id),
  texto: text('texto').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

// ─── Feature flags ─────────────────────────────────────────────────────────
export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

// ─── Bling tokens (singleton via check id=1) ───────────────────────────────
// Refresh é race-sensitive (pegadinha #4). Lock pessimista via SELECT FOR UPDATE em lib/bling/tokens.ts.
export const blingTokens = pgTable(
  'bling_tokens',
  {
    id: smallint('id').primaryKey().default(1),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token').notNull(),
    accessExpiresAt: timestamp('access_expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    refreshExpiresAt: timestamp('refresh_expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    singleton: check('bling_tokens_singleton', sql`${t.id} = 1`),
  }),
);

// ─── Templates de mensagem ─────────────────────────────────────────────────
// keys esperadas: pos_venda_d14, reativacao_1, reativacao_2, reativacao_3.
export const templatesMensagem = pgTable('templates_mensagem', {
  key: text('key').primaryKey(),
  descricao: text('descricao'),
  conteudo: text('conteudo').notNull(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

// ─── Notificações in-app ───────────────────────────────────────────────────
export const notificacoes = pgTable(
  'notificacoes',
  {
    id: serial('id').primaryKey(),
    usuarioId: integer('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    tipo: text('tipo').notNull(),
    titulo: text('titulo').notNull(),
    link: text('link'),
    lida: boolean('lida').notNull().default(false),
    criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    usuarioLidaIdx: index('notificacoes_usuario_lida_idx').on(
      t.usuarioId,
      t.lida,
      t.criadoEm.desc(),
    ),
  }),
);

// ─── Type exports ──────────────────────────────────────────────────────────
export type Contato = typeof contatos.$inferSelect;
export type NewContato = typeof contatos.$inferInsert;
export type Pedido = typeof pedidos.$inferSelect;
export type NewPedido = typeof pedidos.$inferInsert;
export type PedidoItem = typeof pedidoItens.$inferSelect;
export type NewPedidoItem = typeof pedidoItens.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type Atividade = typeof atividades.$inferSelect;
export type NewAtividade = typeof atividades.$inferInsert;
export type Evento = typeof eventos.$inferSelect;
export type NewEvento = typeof eventos.$inferInsert;
export type Usuario = typeof usuarios.$inferSelect;
export type NewUsuario = typeof usuarios.$inferInsert;
export type Comentario = typeof comentarios.$inferSelect;
export type NewComentario = typeof comentarios.$inferInsert;
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type BlingToken = typeof blingTokens.$inferSelect;
export type TemplateMensagem = typeof templatesMensagem.$inferSelect;
export type Notificacao = typeof notificacoes.$inferSelect;
export type NewNotificacao = typeof notificacoes.$inferInsert;

export type ColunaCard = (typeof colunaCardEnum.enumValues)[number];
export type TipoCard = (typeof tipoCardEnum.enumValues)[number];
export type StatusAtividade = (typeof statusAtividadeEnum.enumValues)[number];
export type RoleUsuario = (typeof roleUsuarioEnum.enumValues)[number];
