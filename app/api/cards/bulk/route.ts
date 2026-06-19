import { NextResponse } from 'next/server';
import { sql as drizzleSql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { cards } from '@/db/schema';
import { auth } from '@/lib/auth';
import { logEvent } from '@/lib/audit';

const bulkSchema = z
  .object({
    ids: z.array(z.number().int().positive()).min(1).max(200),
    // finalizado excluído: dispara archive+reativacao — deve ser feito individualmente
    coluna: z.enum(['pendente', 'em_contato']).optional(),
    vendedorId: z.number().int().nullable().optional(),
  })
  .refine((d) => d.coluna !== undefined || d.vendedorId !== undefined, {
    message: 'Pelo menos coluna ou vendedorId deve ser fornecido',
  });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  const body = await req.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { ids, coluna, vendedorId } = parsed.data;
  const updates: Record<string, unknown> = { atualizadoEm: drizzleSql`now()` };
  if (coluna) {
    updates.coluna = coluna;
    updates.colunaDeSde = drizzleSql`now()`;
  }
  if (vendedorId !== undefined) updates.vendedorId = vendedorId;

  const updated = await db
    .update(cards)
    .set(updates)
    .where(inArray(cards.id, ids))
    .returning({ id: cards.id });

  await logEvent({
    tipo: 'cards_bulk_update',
    origem: 'api_interna',
    payload: {
      changes: { coluna, vendedorId },
      ids,
      by: session.user.id,
      count: updated.length,
    },
  });

  return NextResponse.json({ ok: true, updated: updated.length });
}
