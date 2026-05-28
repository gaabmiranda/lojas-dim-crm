import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { atividades, statusAtividadeEnum } from '@/db/schema';
import { auth } from '@/lib/auth';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const cardId = searchParams.get('card_id');
  const status = searchParams.get('status');
  const filters = [];
  if (cardId) filters.push(eq(atividades.cardId, Number(cardId)));
  if (status && (statusAtividadeEnum.enumValues as readonly string[]).includes(status)) {
    filters.push(eq(atividades.status, status as (typeof statusAtividadeEnum.enumValues)[number]));
  }

  const rows = await db
    .select()
    .from(atividades)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(atividades.dataAgendada))
    .limit(200);

  return NextResponse.json({ data: rows });
}

const createSchema = z.object({
  cardId: z.number().int().positive(),
  tipo: z.string().min(1),
  titulo: z.string().min(1),
  descricao: z.string().optional(),
  dataAgendada: z.string().datetime(),
  vendedorId: z.number().int().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const inserted = await db
    .insert(atividades)
    .values({
      cardId: parsed.data.cardId,
      tipo: parsed.data.tipo,
      titulo: parsed.data.titulo,
      descricao: parsed.data.descricao,
      dataAgendada: new Date(parsed.data.dataAgendada),
      vendedorId: parsed.data.vendedorId,
    })
    .returning();

  return NextResponse.json(inserted[0], { status: 201 });
}
