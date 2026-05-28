import { NextResponse } from 'next/server';
import { asc, ilike, or, sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db/client';
import { contatos } from '@/db/schema';
import { auth } from '@/lib/auth';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0);

  const where = q
    ? or(ilike(contatos.nome, `%${q}%`), ilike(contatos.telefone, `%${q.replace(/\D/g, '')}%`))
    : undefined;

  const rows = await db
    .select()
    .from(contatos)
    .where(where)
    .orderBy(asc(contatos.nome))
    .limit(limit)
    .offset(offset);

  const totalResult = await db
    .select({ c: drizzleSql<number>`count(*)::int` })
    .from(contatos)
    .where(where);

  return NextResponse.json({
    data: rows,
    total: totalResult[0]?.c ?? 0,
    limit,
    offset,
  });
}
