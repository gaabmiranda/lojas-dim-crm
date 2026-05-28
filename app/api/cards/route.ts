import { NextResponse } from 'next/server';
import { and, desc, eq, sql as drizzleSql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { cards, colunaCardEnum, tipoCardEnum } from '@/db/schema';
import { auth } from '@/lib/auth';
import { logEvent } from '@/lib/audit';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const coluna = searchParams.get('coluna');
  const vendedorId = searchParams.get('vendedor_id');
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0);

  const filters = [];
  if (coluna && (colunaCardEnum.enumValues as readonly string[]).includes(coluna)) {
    filters.push(eq(cards.coluna, coluna as (typeof colunaCardEnum.enumValues)[number]));
  }
  if (vendedorId) {
    filters.push(eq(cards.vendedorId, Number(vendedorId)));
  }

  const rows = await db.query.cards.findMany({
    where: filters.length ? and(...filters) : undefined,
    with: { contato: true, pedidoOrigem: true },
    orderBy: [desc(cards.criadoEm)],
    limit,
    offset,
  });
  return NextResponse.json({ data: rows, limit, offset });
}

const createSchema = z.object({
  contatoId: z.number().int().positive(),
  pedidoIdOrigem: z.number().int().positive().optional(),
  tipo: z.enum(tipoCardEnum.enumValues),
  nomeExibido: z.string().min(1),
  dataPrevistaAcao: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const inserted = await db
    .insert(cards)
    .values({
      contatoId: data.contatoId,
      pedidoIdOrigem: data.pedidoIdOrigem,
      tipo: data.tipo,
      coluna: 'pendente',
      nomeExibido: data.nomeExibido,
      dataPrevistaAcao: data.dataPrevistaAcao ? new Date(data.dataPrevistaAcao) : null,
      tentativasReativacao: 0,
    })
    .returning();

  const card = inserted[0]!;
  await logEvent({
    tipo: 'card_criado',
    origem: 'api_interna',
    cardId: card.id,
    contatoId: card.contatoId,
    payload: { criadoPor: session.user.id },
  });

  void drizzleSql;
  return NextResponse.json(card, { status: 201 });
}
