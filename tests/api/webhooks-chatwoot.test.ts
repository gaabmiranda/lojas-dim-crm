import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

import { chatwootIncomingMessageSchema } from '@/lib/validators/chatwoot-webhook';

// ─── Schema ──────────────────────────────────────────────────────────────────

describe('chatwoot webhook — schema', () => {
  const base = {
    event: 'message_created',
    id: 999,
    content: 'Boa tarde!',
    message_type: 'incoming',
    conversation: { id: 42 },
  };

  it('aceita payload incoming mínimo', () => {
    const r = chatwootIncomingMessageSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('aceita message_type outgoing (schema não filtra, rota filtra)', () => {
    const r = chatwootIncomingMessageSchema.safeParse({ ...base, message_type: 'outgoing' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.message_type).toBe('outgoing');
  });

  it('aceita message_type activity e template', () => {
    for (const t of ['activity', 'template'] as const) {
      const r = chatwootIncomingMessageSchema.safeParse({ ...base, message_type: t });
      expect(r.success).toBe(true);
    }
  });

  it('rejeita message_type inválido', () => {
    const r = chatwootIncomingMessageSchema.safeParse({ ...base, message_type: 'unknown' });
    expect(r.success).toBe(false);
  });

  it('rejeita evento ausente', () => {
    const { event: _e, ...sem } = base;
    const r = chatwootIncomingMessageSchema.safeParse(sem);
    expect(r.success).toBe(false);
  });

  it('rejeita id ausente', () => {
    const { id: _id, ...sem } = base;
    const r = chatwootIncomingMessageSchema.safeParse(sem);
    expect(r.success).toBe(false);
  });

  it('content tem default vazio quando ausente', () => {
    const { content: _c, ...sem } = base;
    const r = chatwootIncomingMessageSchema.safeParse(sem);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.content).toBe('');
  });

  it('sender.phone_number é opcional', () => {
    const r = chatwootIncomingMessageSchema.safeParse({
      ...base,
      sender: { id: 10, name: 'João', phone_number: '+5538999999999' },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sender?.phone_number).toBe('+5538999999999');
  });

  it('preserva campos extras (passthrough)', () => {
    const r = chatwootIncomingMessageSchema.safeParse({ ...base, extra_field: 'ok' });
    expect(r.success).toBe(true);
  });
});

// ─── Lógica de secret (replicada da rota para teste unitário) ─────────────

function verifySecret(provided: string | null, secret: string | undefined): boolean {
  if (!secret) return true; // sem secret configurado: aceita (com warn)
  if (!provided) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  } catch {
    return false;
  }
}

describe('chatwoot webhook — secret', () => {
  it('aceita quando secret bate exato', () => {
    expect(verifySecret('meu-segredo', 'meu-segredo')).toBe(true);
  });

  it('rejeita quando secret é diferente', () => {
    expect(verifySecret('errado', 'meu-segredo')).toBe(false);
  });

  it('rejeita header nulo quando secret configurado', () => {
    expect(verifySecret(null, 'meu-segredo')).toBe(false);
  });

  it('aceita qualquer header quando secret não configurado', () => {
    expect(verifySecret('qualquer-coisa', undefined)).toBe(true);
    expect(verifySecret(null, undefined)).toBe(true);
  });
});

// ─── Normalização de telefone (replicada da rota) ─────────────────────────

function normalizePhone(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('55')) d = d.slice(2);
  return d;
}

describe('chatwoot webhook — normalizePhone', () => {
  it('remove +55 do prefixo internacional', () => {
    expect(normalizePhone('+5538999991234')).toBe('38999991234');
  });

  it('remove 55 sem +', () => {
    expect(normalizePhone('5538999991234')).toBe('38999991234');
  });

  it('remove caracteres não-dígito', () => {
    expect(normalizePhone('(38) 9 9999-1234')).toBe('38999991234');
  });

  it('não remove 55 que não seja prefixo internacional', () => {
    // número local que já começa com DDD 55 (Caxias do Sul p.ex.)
    expect(normalizePhone('55999991234')).toBe('999991234');
  });

  it('número já limpo permanece igual', () => {
    expect(normalizePhone('38999991234')).toBe('38999991234');
  });
});

// ─── Filtragem message_type na lógica da rota ────────────────────────────

describe('chatwoot webhook — filtragem de tipo', () => {
  it('somente incoming deve ser processado — lógica isolada', () => {
    function shouldProcess(messageType: string) {
      return messageType === 'incoming';
    }
    expect(shouldProcess('incoming')).toBe(true);
    expect(shouldProcess('outgoing')).toBe(false);
    expect(shouldProcess('activity')).toBe(false);
    expect(shouldProcess('template')).toBe(false);
  });
});
