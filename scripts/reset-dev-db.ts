/**
 * Drop + recria schema public. APENAS DEV — recusa rodar em produção.
 * Em seguida aplica migrations via drizzle-kit.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '../db/client';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('REFUSE — NODE_ENV=production. Esse script só roda em dev.');
    process.exit(2);
  }
  const url = process.env.DATABASE_URL ?? '';
  if (url.includes('lojasdim') || url.includes('prod')) {
    console.error('REFUSE — DATABASE_URL parece apontar pra produção. Aborte.');
    process.exit(2);
  }

  console.log('Dropando schema public…');
  await db.execute(drizzleSql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(drizzleSql`CREATE SCHEMA public`);
  console.log('✓ Schema recriado.');

  console.log('Aplicando migrations (drizzle-kit migrate)…');
  execSync('npx drizzle-kit migrate', { stdio: 'inherit' });
  console.log('\n✓ Reset completo. Próximo: npm run seed:admin && npm run seed:templates.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Falha:', err);
    process.exit(1);
  });
