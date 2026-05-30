/**
 * Aplica migrations Drizzle programaticamente.
 * Roda no entrypoint do container em produção (sem precisar drizzle-kit).
 * Idempotente: re-executa sem efeito se migrations já aplicadas.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não configurado.');

  console.log('[migrate-prod] conectando ao Postgres…');
  const pool = postgres(url, { max: 1, prepare: false });
  const db = drizzle(pool);

  console.log('[migrate-prod] aplicando migrations…');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
  console.log('[migrate-prod] ✓ migrations aplicadas.');

  await pool.end();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate-prod] FALHOU:', err);
    process.exit(1);
  });
