import { NextResponse } from 'next/server';
import { and, desc, eq, sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db/client';
import { notificacoes } from '@/db/schema';
import { auth } from '@/lib/auth';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  const userId = Number(session.user.id);
  const { searchParams } = new URL(req.url);
  const lidaParam = searchParams.get('lida');
  const onlyCount = searchParams.get('onlyCount') === 'true';

  const filters = [eq(notificacoes.usuarioId, userId)];
  if (lidaParam === 'true') filters.push(eq(notificacoes.lida, true));
  if (lidaParam === 'false') filters.push(eq(notificacoes.lida, false));

  if (onlyCount) {
    const r = await db
      .select({ c: drizzleSql<number>`count(*)::int` })
      .from(notificacoes)
      .where(and(...filters));
    return NextResponse.json({ count: r[0]?.c ?? 0 });
  }

  const rows = await db
    .select()
    .from(notificacoes)
    .where(and(...filters))
    .orderBy(desc(notificacoes.criadoEm))
    .limit(100);

  return NextResponse.json({ data: rows });
}
