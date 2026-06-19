import { NextResponse } from 'next/server';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db/client';
import { pedidoItens, pedidos } from '@/db/schema';
import { auth } from '@/lib/auth';
import { getPedido } from '@/lib/bling/client';
import { logEvent } from '@/lib/audit';

// Sem limite de tempo — processa em lote de 30 (~15s a 2 req/s).
export const maxDuration = 60;

// GET — quantos pedidos ainda não têm itens buscados individualmente.
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return new NextResponse('forbidden', { status: 403 });
  }

  const result = await db.execute<{ count: number }>(drizzleSql`
    SELECT count(*)::int AS count
    FROM pedidos p
    WHERE NOT EXISTS (SELECT 1 FROM pedido_itens pi WHERE pi.pedido_id = p.id)
      AND (dados_completos_json -> 'itens') IS NULL
  `);

  return NextResponse.json({ semItens: (result[0] as { count: number } | undefined)?.count ?? 0 });
}

// POST — processa um lote (default 30).
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return new NextResponse('forbidden', { status: 403 });
  }

  const url = new URL(req.url);
  const batch = Math.min(50, Math.max(1, Number(url.searchParams.get('batch') ?? '30')));

  const candidatos = await db.execute<{ id: number; id_bling: number }>(drizzleSql`
    SELECT p.id, p.id_bling
    FROM pedidos p
    WHERE NOT EXISTS (SELECT 1 FROM pedido_itens pi WHERE pi.pedido_id = p.id)
      AND (dados_completos_json -> 'itens') IS NULL
    ORDER BY p.id
    LIMIT ${batch}
  `);

  let processados = 0;
  let comItens = 0;
  let semItensNoBling = 0;
  let erros = 0;
  let primeiroErro: string | null = null;

  for (const row of candidatos as { id: number; id_bling: number }[]) {
    try {
      const idBling = Number(row.id_bling); // bigint vem como string do pg
      const blingPedido = await getPedido(idBling);

      // Sempre atualiza dadosCompletosJson com a resposta completa (marca como verificado).
      // JSON.stringify necessário: drizzleSql raw não serializa objetos JS para jsonb automaticamente.
      await db.execute(drizzleSql`
        UPDATE pedidos
        SET dados_completos_json = ${JSON.stringify(blingPedido)}::jsonb,
            atualizado_em = now()
        WHERE id = ${Number(row.id)}
      `);

      if (blingPedido.itens && blingPedido.itens.length > 0) {
        await db.insert(pedidoItens).values(
          blingPedido.itens.map((i) => ({
            pedidoId: row.id,
            descricao: i.descricao,
            quantidade: String(i.quantidade ?? 0),
            valorUnitario: String(i.valor ?? 0),
            valorTotal: String((i.quantidade ?? 0) * (i.valor ?? 0)),
          })),
        );
        comItens++;
      } else {
        semItensNoBling++;
      }
    } catch (err) {
      erros++;
      const msg = err instanceof Error ? err.message : String(err);
      if (!primeiroErro) primeiroErro = `pedido ${row.id} (bling ${row.id_bling}): ${msg}`;
      console.error(`[backfill-itens] pedido ${row.id} (bling ${row.id_bling}):`, err);
    }
    processados++;
  }

  const remaining = await db.execute<{ count: number }>(drizzleSql`
    SELECT count(*)::int AS count
    FROM pedidos p
    WHERE NOT EXISTS (SELECT 1 FROM pedido_itens pi WHERE pi.pedido_id = p.id)
      AND (dados_completos_json -> 'itens') IS NULL
  `);

  await logEvent({
    tipo: 'backfill_itens_pedidos',
    origem: 'api_interna',
    payload: { by: session.user.id, processados, comItens, semItensNoBling, erros },
  });

  return NextResponse.json({
    ok: true,
    processados,
    comItens,
    semItensNoBling,
    erros,
    primeiroErro,
    remaining: (remaining[0] as { count: number } | undefined)?.count ?? 0,
  });
}
