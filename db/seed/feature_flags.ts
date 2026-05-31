import { sql } from 'drizzle-orm';
import { db } from '../client';
import { featureFlags } from '../schema';

// Flags base. setFlag() invalida cache em lib/feature-flags.ts.
const BASE_FLAGS: Array<{ key: string; value: string }> = [
  { key: 'IA_AGENTS_ENABLED', value: 'false' },
  { key: 'BLING_WEBHOOK_ATIVO', value: 'false' },
  { key: 'BLING_POLLING_ATIVO', value: 'true' },
  { key: 'BLING_LAST_SYNC_AT', value: '' },
];

export async function seedFeatureFlags(): Promise<void> {
  for (const flag of BASE_FLAGS) {
    await db
      .insert(featureFlags)
      .values({ key: flag.key, value: flag.value })
      .onConflictDoUpdate({
        target: featureFlags.key,
        // Idempotente: só atualiza timestamp, preserva valor existente.
        set: { atualizadoEm: sql`now()` },
      });
  }
}

seedFeatureFlags()
  .then(() => {
    console.log(`✓ ${BASE_FLAGS.length} feature flags base garantidas.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Erro ao popular feature flags:', err);
    process.exit(1);
  });
