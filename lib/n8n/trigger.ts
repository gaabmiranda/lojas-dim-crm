function env() {
  const base = process.env.N8N_WEBHOOK_BASE_URL?.replace(/\/$/, '');
  const secret = process.env.N8N_SHARED_SECRET;
  if (!base || !secret) {
    throw new Error('N8N_WEBHOOK_BASE_URL e N8N_SHARED_SECRET devem estar configurados.');
  }
  return { base, secret };
}

export async function triggerN8n(slug: string, payload: unknown): Promise<void> {
  const { base, secret } = env();
  const resp = await fetch(`${base}/${slug}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-Secret': secret,
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`n8n webhook ${slug} falhou (${resp.status}): ${text.slice(0, 200)}`);
  }
}

// Verifica header X-N8N-Secret recebido — usado nas rotas que o n8n chama (sync, cron).
export function verifyN8nSecret(req: Request): boolean {
  const secret = process.env.N8N_SHARED_SECRET;
  if (!secret) return false;
  const got = req.headers.get('x-n8n-secret') ?? req.headers.get('X-N8N-Secret');
  if (!got) return false;
  // Comparação segura contra timing attacks.
  return timingSafeEqual(got, secret);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
