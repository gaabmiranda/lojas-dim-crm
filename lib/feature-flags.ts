import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { featureFlags } from '@/db/schema';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function getFlag(key: string): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const rows = await db
    .select({ value: featureFlags.value })
    .from(featureFlags)
    .where(eq(featureFlags.key, key))
    .limit(1);

  const value = rows[0]?.value ?? null;
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

export async function getFlagBool(key: string, defaultValue = false): Promise<boolean> {
  const raw = await getFlag(key);
  if (raw == null) return defaultValue;
  return raw === 'true' || raw === '1';
}

export async function getFlagJson<T>(key: string, defaultValue: T): Promise<T> {
  const raw = await getFlag(key);
  if (raw == null || raw === '') return defaultValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export async function setFlag(key: string, value: string): Promise<void> {
  await db
    .insert(featureFlags)
    .values({ key, value })
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: { value, atualizadoEm: sql`now()` },
    });
  cache.delete(key);
}

// Exposto pra testes; em prod ninguém precisa limpar manualmente.
export function clearFeatureFlagCache(): void {
  cache.clear();
}
