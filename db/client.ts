import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as relations from './relations';

declare global {
  // eslint-disable-next-line no-var
  var __dbPool: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __dbInstance: PostgresJsDatabase<typeof schema & typeof relations> | undefined;
}

const isProd = process.env.NODE_ENV === 'production';

function buildPool(): ReturnType<typeof postgres> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL não configurado no ambiente.');
  }
  return postgres(url, {
    max: isProd ? 10 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
}

function ensurePool() {
  if (!globalThis.__dbPool) globalThis.__dbPool = buildPool();
  return globalThis.__dbPool;
}

function ensureDb() {
  if (!globalThis.__dbInstance) {
    globalThis.__dbInstance = drizzle(ensurePool(), {
      schema: { ...schema, ...relations },
    });
  }
  return globalThis.__dbInstance;
}

// Proxy: instancia conexão sob demanda. Permite importar `db` em arquivos puros
// (templates, audit) sem exigir DATABASE_URL no import time. Tipagem preservada via cast.
export const db = new Proxy(
  {},
  {
    get(_t, prop) {
      return Reflect.get(ensureDb(), prop);
    },
  },
) as PostgresJsDatabase<typeof schema & typeof relations>;

export const sql = new Proxy(
  {},
  {
    get(_t, prop) {
      return Reflect.get(ensurePool(), prop);
    },
    apply(_t, _self, args: unknown[]) {
      return (ensurePool() as unknown as (...a: unknown[]) => unknown)(...args);
    },
  },
) as unknown as ReturnType<typeof postgres>;

export type DbClient = typeof db;
export { schema, relations };
