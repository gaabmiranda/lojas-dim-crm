import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

export async function GET(req: NextRequest) {
  if (req.headers.get('x-admin-secret') !== process.env.N8N_SHARED_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const constraints = await db.execute(sql`
    SELECT conname, contype::text, conrelid::regclass::text AS table_name
    FROM pg_constraint
    WHERE conname IN ('contatos_id_bling_unique', 'pedidos_id_bling_unique')
  `);

  const indexes = await db.execute(sql`
    SELECT indexname, tablename
    FROM pg_indexes
    WHERE indexname IN ('contatos_id_bling_unique', 'pedidos_id_bling_unique')
  `);

  const migrations = await db.execute(sql`
    SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at
  `);

  return NextResponse.json({ constraints, indexes, migrations });
}

export async function POST(req: NextRequest) {
  if (req.headers.get('x-admin-secret') !== process.env.N8N_SHARED_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const results: string[] = [];

  // Fix contatos
  const contatosC = await db.execute(sql`
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contatos_id_bling_unique'
      AND conrelid = 'contatos'::regclass
  `);
  if (contatosC.length === 0) {
    const contatosIdx = await db.execute(sql`
      SELECT 1 FROM pg_indexes WHERE tablename='contatos' AND indexname='contatos_id_bling_unique'
    `);
    if (contatosIdx.length > 0) {
      await db.execute(sql`ALTER TABLE contatos ADD CONSTRAINT "contatos_id_bling_unique" UNIQUE USING INDEX "contatos_id_bling_unique"`);
      results.push('contatos: promoveu índice para constraint');
    } else {
      await db.execute(sql`ALTER TABLE contatos ADD CONSTRAINT "contatos_id_bling_unique" UNIQUE (id_bling)`);
      results.push('contatos: criou constraint nova');
    }
  } else {
    results.push('contatos: constraint já existe');
  }

  // Fix pedidos
  const pedidosC = await db.execute(sql`
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pedidos_id_bling_unique'
      AND conrelid = 'pedidos'::regclass
  `);
  if (pedidosC.length === 0) {
    const pedidosIdx = await db.execute(sql`
      SELECT 1 FROM pg_indexes WHERE tablename='pedidos' AND indexname='pedidos_id_bling_unique'
    `);
    if (pedidosIdx.length > 0) {
      await db.execute(sql`ALTER TABLE pedidos ADD CONSTRAINT "pedidos_id_bling_unique" UNIQUE USING INDEX "pedidos_id_bling_unique"`);
      results.push('pedidos: promoveu índice para constraint');
    } else {
      await db.execute(sql`ALTER TABLE pedidos ADD CONSTRAINT "pedidos_id_bling_unique" UNIQUE (id_bling)`);
      results.push('pedidos: criou constraint nova');
    }
  } else {
    results.push('pedidos: constraint já existe');
  }

  return NextResponse.json({ ok: true, results });
}
