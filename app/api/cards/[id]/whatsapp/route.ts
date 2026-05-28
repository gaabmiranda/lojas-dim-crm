import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { cards } from '@/db/schema';
import { auth } from '@/lib/auth';
import { openOrCreateConversation } from '@/lib/chatwoot/client';
import { logEvent } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  const { id: idStr } = await params;
  const cardId = Number(idStr);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { mensagem?: string };

  const card = await db.query.cards.findFirst({
    where: eq(cards.id, cardId),
    with: { contato: true },
  });

  if (!card) return new NextResponse('not found', { status: 404 });
  if (!card.contato.telefone) {
    return NextResponse.json({ error: 'contato sem telefone' }, { status: 400 });
  }

  const conv = await openOrCreateConversation({
    name: card.contato.nome,
    phone: card.contato.telefone,
    content: body.mensagem ?? 'Olá! Aqui é da Lojas Dim 👋',
  });

  await logEvent({
    tipo: 'whatsapp_aberto',
    origem: 'api_interna',
    cardId,
    contatoId: card.contatoId,
    payload: { conversationId: conv.conversationId, by: session.user.id },
  });

  return NextResponse.json(conv);
}
