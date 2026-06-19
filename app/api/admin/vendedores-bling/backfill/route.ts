import { NextResponse } from 'next/server';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db/client';
import { auth } from '@/lib/auth';
import { logEvent } from '@/lib/audit';

export async function POST(req: Request) {
  void req;
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return new NextResponse('forbidden', { status: 403 });
  }

  // Fase 1: cruzar dadosCompletosJson.vendedor.id com vendedores_bling
  const r1 = await db.execute<{ count: number }>(drizzleSql`
    WITH updated AS (
      UPDATE cards c
      SET vendedor_id = vb.id
      FROM pedidos p
      JOIN vendedores_bling vb
        ON (p.dados_completos_json -> 'vendedor' ->> 'id')::bigint = vb.id_bling
      WHERE c.pedido_id_origem = p.id
        AND c.vendedor_id IS NULL
      RETURNING c.id
    )
    SELECT count(*)::int AS count FROM updated
  `);
  const updatedPhase1 = (r1[0] as { count: number } | undefined)?.count ?? 0;

  // Fase 2: round-robin sequencial pelos cards que ainda ficaram sem vendedor
  const r2 = await db.execute<{ count: number }>(drizzleSql`
    WITH
    vendors AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS rank
      FROM vendedores_bling
    ),
    cnt AS (SELECT NULLIF(count(*), 0)::int AS n FROM vendedores_bling),
    null_cards AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS rn
      FROM cards
      WHERE vendedor_id IS NULL
    ),
    assignments AS (
      SELECT nc.id AS card_id, v.id AS vendor_id
      FROM null_cards nc
      CROSS JOIN cnt
      JOIN vendors v ON nc.rn % cnt.n = v.rank
      WHERE cnt.n IS NOT NULL
    ),
    updated AS (
      UPDATE cards c
      SET vendedor_id = a.vendor_id
      FROM assignments a
      WHERE c.id = a.card_id
      RETURNING c.id
    )
    SELECT count(*)::int AS count FROM updated
  `);
  const updatedPhase2 = (r2[0] as { count: number } | undefined)?.count ?? 0;

  const updated = updatedPhase1 + updatedPhase2;

  await logEvent({
    tipo: 'backfill_vendedores',
    origem: 'api_interna',
    payload: { by: session.user.id, rowsUpdated: updated, phase1: updatedPhase1, phase2: updatedPhase2 },
  });

  return NextResponse.json({ ok: true, updated, phase1: updatedPhase1, phase2: updatedPhase2 });
}
