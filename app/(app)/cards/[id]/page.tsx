import { notFound } from 'next/navigation';
import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { cards, pedidos, vendedoresBling } from '@/db/schema';
import { CardDetail } from './CardDetail';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CardDetailPage({ params }: PageProps) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const card = await db.query.cards.findFirst({
    where: eq(cards.id, id),
    with: {
      contato: true,
      pedidoOrigem: { with: { itens: true } },
      atividades: true,
      comentarios: { with: { usuario: true } },
      vendedor: true,
    },
  });
  if (!card) notFound();

  const [historicoBase, cardsAnteriores, todosVendedores] = await Promise.all([
    db.query.pedidos.findMany({
      where: eq(pedidos.contatoId, card.contatoId),
      orderBy: [desc(pedidos.data)],
      limit: 10,
      with: { itens: true },
    }),
    db.query.cards.findMany({
      where: and(eq(cards.contatoId, card.contatoId), eq(cards.coluna, 'arquivo'), ne(cards.id, id)),
      orderBy: [desc(cards.atualizadoEm)],
      limit: 30,
      with: { pedidoOrigem: true },
    }),
    db.select({ id: vendedoresBling.id, contatoNome: vendedoresBling.contatoNome }).from(vendedoresBling).orderBy(vendedoresBling.id),
  ]);

  // Garante que o pedidoOrigem aparece no histórico mesmo quando seu contatoId difere
  // (pode acontecer se o pedido foi inserido com contato errado antes da correção do upsert).
  const historicoIds = new Set(historicoBase.map((p) => p.id));
  const historico =
    card.pedidoOrigem && !historicoIds.has(card.pedidoOrigem.id)
      ? [card.pedidoOrigem, ...historicoBase]
      : historicoBase;

  return <CardDetail card={card} historico={historico} cardsAnteriores={cardsAnteriores} vendedores={todosVendedores} />;
}
