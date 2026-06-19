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

  // Atualiza cards.vendedor_id usando o id de vendedores_bling diretamente
  const result = await db.execute<{ count: number }>(drizzleSql`
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

  const updated = (result[0] as { count: number } | undefined)?.count ?? 0;

  await logEvent({
    tipo: 'backfill_vendedores',
    origem: 'api_interna',
    payload: { by: session.user.id, rowsUpdated: updated },
  });

  return NextResponse.json({ ok: true, updated });
}
