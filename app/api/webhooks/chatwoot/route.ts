import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { logEvent } from '@/lib/audit';
import { chatwootIncomingMessageSchema } from '@/lib/validators/chatwoot-webhook';

function verifySecret(provided: string | null): boolean {
  const secret = process.env.CHATWOOT_WEBHOOK_SECRET;
  if (!secret) {
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

  // Apenas loga o evento para audit trail — sem transições automáticas de card.
  await logEvent({
    tipo: payload.event,
    origem: 'chatwoot_webhook',
    externalId: String(payload.id),
    payload: payload as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true });
}
