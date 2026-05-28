import { NextResponse } from 'next/server';
import { eq, sql as drizzleSql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { atividades, statusAtividadeEnum } from '@/db/schema';
import { auth } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const schema = z.object({
  status: z.enum(statusAtividadeEnum.enumValues).optional(),
  dataAgendada: z.string().datetime().optional(),
  titulo: z.string().optional(),
  descricao: z.string().optional(),
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.status) {
    updates.status = parsed.data.status;
    if (parsed.data.status === 'concluida') {
      updates.executadaEm = drizzleSql`now()`;
    }
  }
  if (parsed.data.dataAgendada) updates.dataAgendada = new Date(parsed.data.dataAgendada);
  if (parsed.data.titulo) updates.titulo = parsed.data.titulo;
  if (parsed.data.descricao !== undefined) updates.descricao = parsed.data.descricao;

  const updated = await db
    .update(atividades)
    .set(updates)
    .where(eq(atividades.id, id))
    .returning();

  if (!updated[0]) return new NextResponse('not found', { status: 404 });
  return NextResponse.json(updated[0]);
}
