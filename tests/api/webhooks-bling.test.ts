import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

// Testes do schema/HMAC sem stubar DB. Em ambiente de CI com DB, expandir
// pra cobrir criação de card de ponta a ponta.
import { blingWebhookSchema } from '@/lib/validators/bling-webhook';

describe('bling webhook — schema', () => {
  it('aceita payload mínimo com evento + dados.id', () => {
    const payload = { evento: 'pedido_venda.alterado', dados: { id: 42 } };
    const parsed = blingWebhookSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('aceita id como string numérica', () => {
    const payload = { evento: 'pedido_venda.criado', dados: { id: '17592187232931' } };
    const parsed = blingWebhookSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.dados.id).toBe(17592187232931);
    }
  });

  it('preserva campos desconhecidos (passthrough)', () => {
    const payload = {
      evento: 'pedido_venda.alterado',
      dados: { id: 1, extra: 'campo' },
      timestamp: '2026-06-15T10:00:00Z',
    };
    const parsed = blingWebhookSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('rejeita evento ausente', () => {
    const parsed = blingWebhookSchema.safeParse({ dados: { id: 1 } });
    expect(parsed.success).toBe(false);
  });
});

// Testa lógica HMAC isolada (replicada da rota pra teste).
function verifyHmac(rawBody: string, signature: string, secret: string): boolean {
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signature.replace(/^sha256=/, '');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(provided));
  } catch {
    return false;
  }
}

describe('bling webhook — HMAC', () => {
  const secret = 'test-secret-123';
  const body = JSON.stringify({ evento: 'pedido_venda.alterado', dados: { id: 42 } });

  it('aceita assinatura válida', () => {
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyHmac(body, sig, secret)).toBe(true);
  });

  it('aceita assinatura com prefixo sha256=', () => {
    const sig = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifyHmac(body, sig, secret)).toBe(true);
  });

  it('rejeita assinatura inválida', () => {
    expect(verifyHmac(body, 'wrong-sig', secret)).toBe(false);
  });

  it('rejeita body alterado', () => {
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyHmac(body + 'tampered', sig, secret)).toBe(false);
  });
});
