import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { notificacoes } from '@/db/schema';
import { auth } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });
  const userId = Number(session.user.id);

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const updated = await db
    .update(notificacoes)
    .set({ lida: true })
    .where(and(eq(notificacoes.id, id), eq(notificacoes.usuarioId, userId)))
    .returning();

  if (!updated[0]) return new NextResponse('not found', { status: 404 });
  return NextResponse.json(updated[0]);
}
