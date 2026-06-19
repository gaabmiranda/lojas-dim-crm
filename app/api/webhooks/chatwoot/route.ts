import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db/client';
import { cards, contatos } from '@/db/schema';
import { logEvent } from '@/lib/audit';
import { transicaoPorResposta } from '@/lib/kanban';
import { notify } from '@/lib/notifications';
import { chatwootIncomingMessageSchema } from '@/lib/validators/chatwoot-webhook';

function verifySecret(provided: string | null): boolean {
  const secret = process.env.CHATWOOT_WEBHOOK_SECRET;
  if (!secret) {
    // Sem secret configurado: aceitamos qualquer request, mas logamos.
    console.warn('[chatwoot-webhook] CHATWOOT_WEBHOOK_SECRET não configurado.');
    return true;
  }
  if (!provided) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  } catch {
    return false;
  }
}

function normalizePhone(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('55')) d = d.slice(2);
  return d;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const secret = req.headers.get('x-chatwoot-secret') ?? req.headers.get('X-Chatwoot-Secret');
  if (!verifySecret(secret)) {
    return new NextResponse('forbidden', { status: 403 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return new NextResponse('invalid json', { status: 400 });
  }

  const parsed = chatwootIncomingMessageSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }
  const payload = parsed.data;

  // Filtra apenas incoming (cliente respondendo).
  if (payload.message_type !== 'incoming') {
    return NextResponse.json({ ok: true, ignored: payload.message_type });
  }

  // Idempotência por message_id.
  const audit = await logEvent({
    tipo: payload.event,
    origem: 'chatwoot_webhook',
    externalId: String(payload.id),
    payload: payload as unknown as Record<string, unknown>,
  });
  if (audit.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const phone = payload.sender?.phone_number;
  if (!phone) {
    return NextResponse.json({ ok: true, ignored: 'sem phone_number' });
  }

  const phoneNorm = normalizePhone(phone);

  // Match contato pelo telefone (normalizado).
  const [contato] = await db
    .select({ id: contatos.id })
    .from(contatos)
    .where(drizzleSql`replace(replace(telefone, '+55', ''), ' ', '') = ${phoneNorm}`)
    .limit(1);

  if (!contato) {
    return NextResponse.json({ ok: true, ignored: 'contato não encontrado', phone: phoneNorm });
  }

  const [cardAtivo] = await db
    .select()
    .from(cards)
    .where(
      drizzleSql`contato_id = ${contato.id} AND coluna = 'em_contato'`,
    )
    .limit(1);

  if (!cardAtivo) {
    return NextResponse.json({ ok: true, ignored: 'sem card em_contato pra esse contato' });
  }

  const transicao = transicaoPorResposta(
    {
      id: cardAtivo.id,
      contatoId: cardAtivo.contatoId,
      tipo: cardAtivo.tipo,
      coluna: cardAtivo.coluna,
      tentativasReativacao: cardAtivo.tentativasReativacao,
      dataPrevistaAcao: cardAtivo.dataPrevistaAcao,
      atualizadoEm: cardAtivo.atualizadoEm,
    },
    new Date(),
  );

  if (!transicao) {
    return NextResponse.json({ ok: true, ignored: 'transição nula' });
  }

  await db.transaction(async (tx) => {
    if (transicao.tipo === 'finalizar_por_resposta') {
      await tx
        .update(cards)
        .set({ coluna: 'finalizado', atualizadoEm: drizzleSql`now()` })
        .where(drizzleSql`id = ${transicao.cardId}`);

      await tx.insert(cards).values({
        contatoId: transicao.criarNovoCard.contatoId,
        tipo: 'reativacao',
        coluna: 'pendente',
        nomeExibido: cardAtivo.nomeExibido ?? `Reativação · contato ${contato.id}`,
        dataPrevistaAcao: transicao.criarNovoCard.dataPrevistaAcao,
        tentativasReativacao: 0,
        vendedorId: cardAtivo.vendedorId,
      });
    }
  });

  // Notificar vendedor responsável (se atribuído).
  if (transicao.tipo === 'finalizar_por_resposta' && cardAtivo.vendedorId) {
    try {
      await notify({
        usuarioId: cardAtivo.vendedorId,
        tipo: 'cliente_respondeu',
        titulo: `Cliente respondeu — card ${cardAtivo.nomeExibido}`,
        link: `/cards/${cardAtivo.id}`,
        alsoWhatsapp: true,
      });
    } catch (err) {
      console.warn('[chatwoot-webhook] falha ao notificar:', err);
    }
  }

  return NextResponse.json({ ok: true, transicao: transicao.tipo });
}
