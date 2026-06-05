import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { blingTokens, type BlingToken } from '@/db/schema';
import type { BlingTokenResponse } from './types';

const BLING_OAUTH_URL = 'https://www.bling.com.br/Api/v3/oauth/token';
const REFRESH_SKEW_SECONDS = 60; // refresh quando faltam menos de 60s pra expirar

export async function getCurrentTokens(): Promise<BlingToken | null> {
  const rows = await db.select().from(blingTokens).where(drizzleSql`id = 1`).limit(1);
  return rows[0] ?? null;
}

export async function saveTokens(response: BlingTokenResponse): Promise<void> {
  const now = new Date();
  const accessExpiresAt = new Date(now.getTime() + response.expires_in * 1000);
  const refreshExpiresAt = response.refresh_expires_in
    ? new Date(now.getTime() + response.refresh_expires_in * 1000)
    : // Default: refresh dura ~30 dias quando o Bling não devolve refresh_expires_in.
      new Date(now.getTime() + 30 * 24 * 3600 * 1000);

  await db
    .insert(blingTokens)
    .values({
      id: 1,
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      accessExpiresAt,
      refreshExpiresAt,
    })
    .onConflictDoUpdate({
      target: blingTokens.id,
      set: {
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        accessExpiresAt,
        refreshExpiresAt,
        atualizadoEm: drizzleSql`now()`,
      },
    });
}

// Refresh com lock pessimista pra evitar race entre dois processos.
// Pegadinha #4: refresh antigo é invalidado quando o novo é emitido.
// Se 2 callers tentam refresh em paralelo, o 2º espera, relê, e detecta token já válido.
export async function refreshTokens(): Promise<BlingToken> {
  const clientId = process.env.BLING_CLIENT_ID;
  const clientSecret = process.env.BLING_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('BLING_CLIENT_ID e BLING_CLIENT_SECRET devem estar configurados.');
  }

  return await db.transaction(async (tx) => {
    // SELECT FOR UPDATE — bloqueia outros refreshs concorrentes.
    // Usa ORM (não raw SQL) para garantir mapeamento camelCase correto dos campos.
    const lockedRows = await tx
      .select()
      .from(blingTokens)
      .where(eq(blingTokens.id, 1))
      .for('update');
    const locked = lockedRows[0];
    if (!locked) {
      throw new Error(
        'Tabela bling_tokens vazia. Execute fluxo OAuth inicial pra popular o registro singleton.',
      );
    }

    // Re-check: se outro processo já refreshou, retorna o token novo sem chamar Bling de novo.
    const now = new Date();
    const skewMs = REFRESH_SKEW_SECONDS * 1000;
    if (locked.accessExpiresAt.getTime() - skewMs > now.getTime()) {
      return locked;
    }

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: locked.refreshToken,
    });

    const resp = await fetch(BLING_OAUTH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: '1.0', // pegadinha #4 — header esquisito mas obrigatório
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Bling refresh falhou (${resp.status}): ${text}`);
    }

    const json = (await resp.json()) as BlingTokenResponse;
    const newAccessExpires = new Date(now.getTime() + json.expires_in * 1000);
    const newRefreshExpires = json.refresh_expires_in
      ? new Date(now.getTime() + json.refresh_expires_in * 1000)
      : new Date(now.getTime() + 30 * 24 * 3600 * 1000);

    await tx
      .update(blingTokens)
      .set({
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        accessExpiresAt: newAccessExpires,
        refreshExpiresAt: newRefreshExpires,
        atualizadoEm: drizzleSql`now()`,
      })
      .where(drizzleSql`id = 1`);

    return {
      ...locked,
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      accessExpiresAt: newAccessExpires,
      refreshExpiresAt: newRefreshExpires,
      atualizadoEm: new Date(),
    };
  });
}

export async function ensureValidAccessToken(): Promise<string> {
  const current = await getCurrentTokens();
  if (!current) {
    throw new Error('Sem tokens Bling no banco. Execute fluxo OAuth inicial.');
  }
  const skewMs = REFRESH_SKEW_SECONDS * 1000;
  if (current.accessExpiresAt.getTime() - skewMs > Date.now()) {
    return current.accessToken;
  }
  const refreshed = await refreshTokens();
  return refreshed.accessToken;
}
