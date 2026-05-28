import { NextResponse } from 'next/server';
import { desc, eq, sql as drizzleSql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { cards, colunaCardEnum, pedidos } from '@/db/schema';
import { auth } from '@/lib/auth';
import { logEvent } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

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

  if (!card) return new NextResponse('not found', { status: 404 });

  const historicoPedidos = await db.query.pedidos.findMany({
    where: eq(pedidos.contatoId, card.contatoId),
    orderBy: [desc(pedidos.data)],
    limit: 10,
  });

  return NextResponse.json({ ...card, historicoPedidos });
}

const patchSchema = z.object({
  coluna: z.enum(colunaCardEnum.enumValues).optional(),
  vendedorId: z.number().int().nullable().optional(),
  nomeExibido: z.string().min(1).optional(),
});

export async function PATCH(req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Record<string, unknown> = { atualizadoEm: drizzleSql`now()` };
  if (parsed.data.coluna) updates.coluna = parsed.data.coluna;
  if (parsed.data.vendedorId !== undefined) updates.vendedorId = parsed.data.vendedorId;
  if (parsed.data.nomeExibido) updates.nomeExibido = parsed.data.nomeExibido;

  const updated = await db
    .update(cards)
    .set(updates)
    .where(eq(cards.id, id))
    .returning();

  if (!updated[0]) return new NextResponse('not found', { status: 404 });

  await logEvent({
    tipo: 'card_patch',
    origem: 'api_interna',
    cardId: id,
    payload: { changes: parsed.data, by: session.user.id },
  });

  return NextResponse.json(updated[0]);
}
