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
    colunaDeSde: timestamp('coluna_desde', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    colunaDataIdx: index('cards_coluna_data_idx').on(t.coluna, t.dataPrevistaAcao),
    colunaDesdeIdx: index('cards_coluna_desde_idx').on(t.colunaDeSde),
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

// ─── Formas de pagamento (lookup Bling) ────────────────────────────────────
export const formasPagamento = pgTable('formas_pagamento', {
  id: serial('id').primaryKey(),
  idBling: bigint('id_bling', { mode: 'number' }).notNull(),
  descricao: text('descricao').notNull(),
  tipoPagamento: smallint('tipo_pagamento'),
  situacao: text('situacao'),
  padrao: boolean('padrao').default(false),
  criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  idBlingUnique: uniqueIndex('formas_pagamento_id_bling_unique').on(t.idBling),
}));

// ─── Categorias receitas/despesas (lookup Bling) ───────────────────────────
export const categoriasFinanceiras = pgTable('categorias_financeiras', {
  id: serial('id').primaryKey(),
  idBling: bigint('id_bling', { mode: 'number' }).notNull(),
  descricao: text('descricao').notNull(),
  tipo: text('tipo'), // 'R' | 'D'
  situacao: text('situacao'),
  criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  idBlingUnique: uniqueIndex('categorias_financeiras_id_bling_unique').on(t.idBling),
}));

// ─── Contas a receber ──────────────────────────────────────────────────────
export const contasReceber = pgTable(
  'contas_receber',
  {
    id: serial('id').primaryKey(),
    idBling: bigint('id_bling', { mode: 'number' }).notNull(),
    contatoId: integer('contato_id').references(() => contatos.id),
    contatoIdBling: bigint('contato_id_bling', { mode: 'number' }),
    situacao: text('situacao'),
    vencimento: date('vencimento', { mode: 'date' }),
    vencimentoOriginal: date('vencimento_original', { mode: 'date' }),
    valor: numeric('valor', { precision: 14, scale: 2 }),
    saldo: numeric('saldo', { precision: 14, scale: 2 }),
    historico: text('historico'),
    numeroBanco: text('numero_banco'),
    categoriaIdBling: bigint('categoria_id_bling', { mode: 'number' }),
    dadosJson: jsonb('dados_json'),
    criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    idBlingUnique: uniqueIndex('contas_receber_id_bling_unique').on(t.idBling),
    vencimentoIdx: index('contas_receber_vencimento_idx').on(t.vencimento),
    situacaoIdx: index('contas_receber_situacao_idx').on(t.situacao),
    contatoIdx: index('contas_receber_contato_idx').on(t.contatoId),
  }),
);

// ─── Contas a pagar ────────────────────────────────────────────────────────
export const contasPagar = pgTable(
  'contas_pagar',
  {
    id: serial('id').primaryKey(),
    idBling: bigint('id_bling', { mode: 'number' }).notNull(),
    fornecedorId: integer('fornecedor_id').references(() => contatos.id),
    fornecedorIdBling: bigint('fornecedor_id_bling', { mode: 'number' }),
    situacao: text('situacao'),
    vencimento: date('vencimento', { mode: 'date' }),
    vencimentoOriginal: date('vencimento_original', { mode: 'date' }),
    valor: numeric('valor', { precision: 14, scale: 2 }),
    saldo: numeric('saldo', { precision: 14, scale: 2 }),
    historico: text('historico'),
    numeroBanco: text('numero_banco'),
    categoriaIdBling: bigint('categoria_id_bling', { mode: 'number' }),
    dadosJson: jsonb('dados_json'),
    criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    idBlingUnique: uniqueIndex('contas_pagar_id_bling_unique').on(t.idBling),
    vencimentoIdx: index('contas_pagar_vencimento_idx').on(t.vencimento),
    situacaoIdx: index('contas_pagar_situacao_idx').on(t.situacao),
  }),
);

// ─── Categorias de produtos (lookup Bling) ─────────────────────────────────
export const categoriasProdutos = pgTable('categorias_produtos', {
  id: serial('id').primaryKey(),
  idBling: bigint('id_bling', { mode: 'number' }).notNull(),
  descricao: text('descricao').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  idBlingUnique: uniqueIndex('categorias_produtos_id_bling_unique').on(t.idBling),
}));

// ─── Depósitos (lookup Bling) ──────────────────────────────────────────────
export const depositos = pgTable('depositos', {
  id: serial('id').primaryKey(),
  idBling: bigint('id_bling', { mode: 'number' }).notNull(),
  descricao: text('descricao').notNull(),
  situacao: text('situacao'),
  padrao: boolean('padrao').default(false),
  criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  idBlingUnique: uniqueIndex('depositos_id_bling_unique').on(t.idBling),
}));

// ─── Produtos ──────────────────────────────────────────────────────────────
export const produtos = pgTable(
  'produtos',
  {
    id: serial('id').primaryKey(),
    idBling: bigint('id_bling', { mode: 'number' }).notNull(),
    nome: text('nome').notNull(),
    codigo: text('codigo'),
    tipo: text('tipo'), // 'P' | 'S' | 'K'
    situacao: text('situacao'),
    preco: numeric('preco', { precision: 14, scale: 2 }),
    precoCusto: numeric('preco_custo', { precision: 14, scale: 2 }),
    unidade: text('unidade'),
    categoriaIdBling: bigint('categoria_id_bling', { mode: 'number' }),
    dadosJson: jsonb('dados_json'),
    criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    idBlingUnique: uniqueIndex('produtos_id_bling_unique').on(t.idBling),
    nomeIdx: index('produtos_nome_idx').on(t.nome),
    codigoIdx: index('produtos_codigo_idx').on(t.codigo),
  }),
);

// ─── Produto variações ─────────────────────────────────────────────────────
export const produtoVariacoes = pgTable(
  'produto_variacoes',
  {
    id: serial('id').primaryKey(),
    idBling: bigint('id_bling', { mode: 'number' }).notNull(),
    produtoId: integer('produto_id').references(() => produtos.id, { onDelete: 'cascade' }),
    produtoIdBling: bigint('produto_id_bling', { mode: 'number' }).notNull(),
    nome: text('nome'),
    codigo: text('codigo'),
    preco: numeric('preco', { precision: 14, scale: 2 }),
    criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    idBlingUnique: uniqueIndex('produto_variacoes_id_bling_unique').on(t.idBling),
    produtoIdx: index('produto_variacoes_produto_idx').on(t.produtoId),
  }),
);

// ─── Estoques (saldo atual por depósito) ───────────────────────────────────
export const estoques = pgTable(
  'estoques',
  {
    id: serial('id').primaryKey(),
    produtoId: integer('produto_id').references(() => produtos.id, { onDelete: 'cascade' }),
    produtoIdBling: bigint('produto_id_bling', { mode: 'number' }).notNull(),
    depositoIdBling: bigint('deposito_id_bling', { mode: 'number' }),
    depositoNome: text('deposito_nome'),
    saldoVirtual: numeric('saldo_virtual', { precision: 14, scale: 4 }),
    saldoFisico: numeric('saldo_fisico', { precision: 14, scale: 4 }),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    produtoDepositoUnique: uniqueIndex('estoques_produto_deposito_unique').on(t.produtoIdBling, t.depositoIdBling),
    produtoIdx: index('estoques_produto_idx').on(t.produtoId),
  }),
);

// ─── Pedidos de compra ─────────────────────────────────────────────────────
export const pedidosCompra = pgTable(
  'pedidos_compra',
  {
    id: serial('id').primaryKey(),
    idBling: bigint('id_bling', { mode: 'number' }).notNull(),
    fornecedorId: integer('fornecedor_id').references(() => contatos.id),
    fornecedorIdBling: bigint('fornecedor_id_bling', { mode: 'number' }),
    numero: text('numero'),
    data: date('data', { mode: 'date' }),
    situacaoValor: smallint('situacao_valor'),
    total: numeric('total', { precision: 14, scale: 2 }),
    dadosJson: jsonb('dados_json'),
    criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    idBlingUnique: uniqueIndex('pedidos_compra_id_bling_unique').on(t.idBling),
    dataIdx: index('pedidos_compra_data_idx').on(t.data.desc()),
  }),
);

export const pedidosCompraItens = pgTable('pedidos_compra_itens', {
  id: serial('id').primaryKey(),
  pedidoCompraId: integer('pedido_compra_id').notNull().references(() => pedidosCompra.id, { onDelete: 'cascade' }),
  produtoIdBling: bigint('produto_id_bling', { mode: 'number' }),
  descricao: text('descricao').notNull(),
  quantidade: numeric('quantidade', { precision: 14, scale: 4 }),
  valorUnitario: numeric('valor_unitario', { precision: 14, scale: 2 }),
  valorTotal: numeric('valor_total', { precision: 14, scale: 2 }),
});

// ─── Naturezas de operação (lookup Bling) ──────────────────────────────────
export const naturezasOperacao = pgTable('naturezas_operacao', {
  id: serial('id').primaryKey(),
  idBling: bigint('id_bling', { mode: 'number' }).notNull(),
  descricao: text('descricao').notNull(),
  tipo: text('tipo'),
  criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  idBlingUnique: uniqueIndex('naturezas_operacao_id_bling_unique').on(t.idBling),
}));

// ─── NF-e ─────────────────────────────────────────────────────────────────
export const nfe = pgTable(
  'nfe',
  {
    id: serial('id').primaryKey(),
    idBling: bigint('id_bling', { mode: 'number' }).notNull(),
    numero: text('numero'),
    serie: text('serie'),
    situacao: smallint('situacao'),
    dataEmissao: date('data_emissao', { mode: 'date' }),
    contatoIdBling: bigint('contato_id_bling', { mode: 'number' }),
    contatoId: integer('contato_id').references(() => contatos.id),
    valorTotal: numeric('valor_total', { precision: 14, scale: 2 }),
    chave: text('chave'),
    dadosJson: jsonb('dados_json'),
    criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    idBlingUnique: uniqueIndex('nfe_id_bling_unique').on(t.idBling),
    dataEmissaoIdx: index('nfe_data_emissao_idx').on(t.dataEmissao.desc()),
    situacaoIdx: index('nfe_situacao_idx').on(t.situacao),
  }),
);

// ─── NFC-e ────────────────────────────────────────────────────────────────
export const nfce = pgTable(
  'nfce',
  {
    id: serial('id').primaryKey(),
    idBling: bigint('id_bling', { mode: 'number' }).notNull(),
    numero: text('numero'),
    serie: text('serie'),
    situacao: smallint('situacao'),
    dataEmissao: date('data_emissao', { mode: 'date' }),
    valorTotal: numeric('valor_total', { precision: 14, scale: 2 }),
    chave: text('chave'),
    dadosJson: jsonb('dados_json'),
    criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    idBlingUnique: uniqueIndex('nfce_id_bling_unique').on(t.idBling),
    dataEmissaoIdx: index('nfce_data_emissao_idx').on(t.dataEmissao.desc()),
  }),
);

// ─── Logísticas (lookup Bling) ─────────────────────────────────────────────
export const logisticas = pgTable('logisticas', {
  id: serial('id').primaryKey(),
  idBling: bigint('id_bling', { mode: 'number' }).notNull(),
  nome: text('nome').notNull(),
  tipo: text('tipo'),
  situacao: text('situacao'),
  criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  idBlingUnique: uniqueIndex('logisticas_id_bling_unique').on(t.idBling),
}));

// ─── Logísticas remessas ───────────────────────────────────────────────────
export const logisticasRemessas = pgTable(
  'logisticas_remessas',
  {
    id: serial('id').primaryKey(),
    idBling: bigint('id_bling', { mode: 'number' }).notNull(),
    situacao: text('situacao'),
    codigoRastreio: text('codigo_rastreio'),
    pedidoIdBling: bigint('pedido_id_bling', { mode: 'number' }),
    pedidoId: integer('pedido_id').references(() => pedidos.id),
    logisticaIdBling: bigint('logistica_id_bling', { mode: 'number' }),
    dadosJson: jsonb('dados_json'),
    criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    idBlingUnique: uniqueIndex('logisticas_remessas_id_bling_unique').on(t.idBling),
    pedidoIdx: index('logisticas_remessas_pedido_idx').on(t.pedidoId),
  }),
);

// ─── Vendedores Bling (lookup) ─────────────────────────────────────────────
export const vendedoresBling = pgTable('vendedores_bling', {
  id: serial('id').primaryKey(),
  idBling: bigint('id_bling', { mode: 'number' }).notNull(),
  contatoIdBling: bigint('contato_id_bling', { mode: 'number' }),
  contatoNome: text('contato_nome'),
  comissao: numeric('comissao', { precision: 5, scale: 2 }),
  criadoEm: timestamp('criado_em', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => ({
  idBlingUnique: uniqueIndex('vendedores_bling_id_bling_unique').on(t.idBling),
}));

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
