import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/client';
import { comentarios } from '@/db/schema';
import { auth } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const schema = z.object({ texto: z.string().min(1).max(2000) });

export async function POST(req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  const { id: idStr } = await params;
  const cardId = Number(idStr);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const inserted = await db
    .insert(comentarios)
    .values({
      cardId,
      usuarioId: Number(session.user.id),
      texto: parsed.data.texto,
    })
    .returning();

  return NextResponse.json(inserted[0], { status: 201 });
}
