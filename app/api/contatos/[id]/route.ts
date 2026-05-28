import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { contatos, pedidos } from '@/db/schema';
import { auth } from '@/lib/auth';

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

  const contato = await db.query.contatos.findFirst({
    where: eq(contatos.id, id),
  });
  if (!contato) return new NextResponse('not found', { status: 404 });

  const pedidosList = await db.query.pedidos.findMany({
    where: eq(pedidos.contatoId, id),
    orderBy: [desc(pedidos.data)],
    limit: 50,
    with: { itens: true },
  });

  return NextResponse.json({ ...contato, pedidos: pedidosList });
}
