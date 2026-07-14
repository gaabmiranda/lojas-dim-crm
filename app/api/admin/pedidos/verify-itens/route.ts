import { NextResponse } from 'next/server';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db/client';
import { pedidoItens } from '@/db/schema';
import { auth } from '@/lib/auth';
import { getPedido } from '@/lib/bling/client';
import { logEvent } from '@/lib/audit';

export const maxDuration = 60;

const MISMATCH_SQL = drizzleSql`
  SELECT p.id, p.id_bling, p.numero,
         p.total::text AS total,
         COALESCE(SUM(pi.valor_total::numeric), 0)::text AS soma_itens,
         COUNT(pi.id)::int AS num_itens
  FROM pedidos p
  LEFT JOIN pedido_itens pi ON pi.pedido_id = p.id
  WHERE p.total IS NOT NULL AND p.total::numeric > 0
  GROUP BY p.id, p.id_bling, p.numero, p.total
  HAVING ABS(COALESCE(SUM(pi.valor_total::numeric), 0) - p.total::numeric) > 5
     AND COALESCE(SUM(pi.valor_total::numeric), 0) > 0
`;

interface MismatchRow {
  id: number;
  id_bling: number;
  numero: string | null;
  total: string;
  soma_itens: string;
  num_itens: number;
}

// GET — conta pedidos com itens divergentes do total
export async function GET(_req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return new NextResponse('forbidden', { status: 403 });
  }

  const result = await db.execute<{ count: number }>(drizzleSql`
    SELECT COUNT(*)::int AS count FROM (${MISMATCH_SQL}) sub
  `);

  return NextResponse.json({
    divergentes: (result[0] as { count: number } | undefined)?.count ?? 0,
  });
}

// POST — corrige um lote de pedidos com mismatch
// ?batch=20  (default 20, max 50)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return new NextResponse('forbidden', { status: 403 });
  }

  const url = new URL(req.url);
  const batch = Math.min(50, Math.max(1, Number(url.searchParams.get('batch') ?? '20')));

  const candidatos = await db.execute(drizzleSql`
    ${MISMATCH_SQL}
    ORDER BY p.id
    LIMIT ${batch}
  `);

  let corrigidos = 0;
  let erros = 0;
  const detalhes: {
    pedido: string | null;
    soma_antes: string;
    total: string;
    itens_depois: number;
    ok: boolean;
  }[] = [];

  for (const row of candidatos as unknown as MismatchRow[]) {
    const pedidoId = Number(row.id);
    const idBling = Number(row.id_bling);
    try {
      const blingPedido = await getPedido(idBling);
      await db.execute(drizzleSql`
        UPDATE pedidos
        SET dados_completos_json = ${JSON.stringify(blingPedido)}::jsonb, atualizado_em = now()
        WHERE id = ${pedidoId}
      `);
      if (blingPedido.itens && blingPedido.itens.length > 0) {
        await db.delete(pedidoItens).where(drizzleSql`pedido_id = ${pedidoId}`);
        await db.insert(pedidoItens).values(
          blingPedido.itens.map((i) => ({
            pedidoId,
            descricao: i.descricao,
            quantidade: String(i.quantidade ?? 0),
            valorUnitario: String(i.valor ?? 0),
            valorTotal: String((i.quantidade ?? 0) * (i.valor ?? 0)),
          })),
        );
        detalhes.push({ pedido: row.numero, soma_antes: row.soma_itens, total: row.total, itens_depois: blingPedido.itens.length, ok: true });
        corrigidos++;
      } else {
        detalhes.push({ pedido: row.numero, soma_antes: row.soma_itens, total: row.total, itens_depois: 0, ok: false });
      }
    } catch (err) {
      erros++;
      detalhes.push({ pedido: row.numero, soma_antes: row.soma_itens, total: row.total, itens_depois: -1, ok: false });
      console.error(`[verify-itens] pedido ${pedidoId} (bling ${idBling}):`, err);
    }
  }

  const remaining = await db.execute<{ count: number }>(drizzleSql`
    SELECT COUNT(*)::int AS count FROM (${MISMATCH_SQL}) sub
  `);

  await logEvent({
    tipo: 'verify_itens_pedidos',
    origem: 'api_interna',
    payload: { by: session.user.id, corrigidos, erros, batch },
  });

  return NextResponse.json({
    ok: true,
    corrigidos,
    erros,
    remaining: (remaining[0] as { count: number } | undefined)?.count ?? 0,
    detalhes,
  });
}
