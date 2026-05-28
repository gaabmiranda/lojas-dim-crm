import { relations } from 'drizzle-orm';
import {
  atividades,
  cards,
  comentarios,
  contatos,
  eventos,
  notificacoes,
  pedidoItens,
  pedidos,
  usuarios,
} from './schema';

export const contatosRelations = relations(contatos, ({ many }) => ({
  pedidos: many(pedidos),
  cards: many(cards),
  eventos: many(eventos),
}));

export const pedidosRelations = relations(pedidos, ({ one, many }) => ({
  contato: one(contatos, {
    fields: [pedidos.contatoId],
    references: [contatos.id],
  }),
  itens: many(pedidoItens),
}));

export const pedidoItensRelations = relations(pedidoItens, ({ one }) => ({
  pedido: one(pedidos, {
    fields: [pedidoItens.pedidoId],
    references: [pedidos.id],
  }),
}));

export const cardsRelations = relations(cards, ({ one, many }) => ({
  contato: one(contatos, {
    fields: [cards.contatoId],
    references: [contatos.id],
  }),
  pedidoOrigem: one(pedidos, {
    fields: [cards.pedidoIdOrigem],
    references: [pedidos.id],
  }),
  vendedor: one(usuarios, {
    fields: [cards.vendedorId],
    references: [usuarios.id],
  }),
  atividades: many(atividades),
  comentarios: many(comentarios),
  eventos: many(eventos),
}));

export const atividadesRelations = relations(atividades, ({ one }) => ({
  card: one(cards, {
    fields: [atividades.cardId],
    references: [cards.id],
  }),
  vendedor: one(usuarios, {
    fields: [atividades.vendedorId],
    references: [usuarios.id],
  }),
}));

export const eventosRelations = relations(eventos, ({ one }) => ({
  card: one(cards, {
    fields: [eventos.cardId],
    references: [cards.id],
  }),
  contato: one(contatos, {
    fields: [eventos.contatoId],
    references: [contatos.id],
  }),
}));

export const comentariosRelations = relations(comentarios, ({ one }) => ({
  card: one(cards, {
    fields: [comentarios.cardId],
    references: [cards.id],
  }),
  usuario: one(usuarios, {
    fields: [comentarios.usuarioId],
    references: [usuarios.id],
  }),
}));

export const usuariosRelations = relations(usuarios, ({ many }) => ({
  cardsAtribuidos: many(cards),
  atividades: many(atividades),
  comentarios: many(comentarios),
  notificacoes: many(notificacoes),
}));

export const notificacoesRelations = relations(notificacoes, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [notificacoes.usuarioId],
    references: [usuarios.id],
  }),
}));
