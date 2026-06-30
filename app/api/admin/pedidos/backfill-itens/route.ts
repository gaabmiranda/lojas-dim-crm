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
// ?numero=28564  força re-fetch de um pedido específico (ignora dadosCompletosJson/itens existentes).
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return new NextResponse('forbidden', { status: 403 });
  }

  const url = new URL(req.url);
  // Aceita numero tanto via body (mais confiável com proxies) quanto via query param.
  const bodyRaw = await req.json().catch(() => ({})) as Record<string, unknown>;
  const numeroForcado = (bodyRaw.numero as string | undefined) || url.searchParams.get('numero');
  const batch = Math.min(50, Math.max(1, Number(url.searchParams.get('batch') ?? '30')));

  // Modo forçado: re-fetch independente do estado atual do pedido.
  if (numeroForcado) {
    const rows = await db.execute<{ id: number; id_bling: number }>(drizzleSql`
      SELECT id, id_bling FROM pedidos WHERE numero = ${numeroForcado} LIMIT 1
    `);
    const row = (rows[0] as { id: number; id_bling: number } | undefined);
    if (!row) return NextResponse.json({ ok: false, erro: `Pedido #${numeroForcado} não encontrado` }, { status: 404 });

    const pedidoId = Number(row.id);
    const idBling = Number(row.id_bling);
    try {
      const blingPedido = await getPedido(idBling);
      await db.execute(drizzleSql`
        UPDATE pedidos SET dados_completos_json = ${JSON.stringify(blingPedido)}::jsonb, atualizado_em = now()
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
      }
      return NextResponse.json({ ok: true, pedidoId, idBling, itens: blingPedido.itens?.length ?? 0 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
    }
  }

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
    const pedidoId = Number(row.id);
    const idBling = Number(row.id_bling); // bigint vem como string do pg
    try {
      const blingPedido = await getPedido(idBling);

      // Sempre marca como verificado antes de inserir itens.
      await db.execute(drizzleSql`
        UPDATE pedidos
        SET dados_completos_json = ${JSON.stringify(blingPedido)}::jsonb,
            atualizado_em = now()
        WHERE id = ${pedidoId}
      `);

      if (blingPedido.itens && blingPedido.itens.length > 0) {
        // DELETE antes de INSERT: idempotência caso pedido seja re-processado
        // (ex: delta sync sobrescreve JSON removendo key 'itens').
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
        comItens++;
      } else {
        semItensNoBling++;
      }
    } catch (err) {
      erros++;
      const msg = err instanceof Error ? err.message : String(err);
      if (!primeiroErro) primeiroErro = `pedido ${pedidoId} (bling ${idBling}): ${msg}`;
      console.error(`[backfill-itens] pedido ${pedidoId} (bling ${idBling}):`, err);
      // Marca como verificado (itens:[]) para parar reprocessamento infinito.
      await db.execute(drizzleSql`
        UPDATE pedidos
        SET dados_completos_json = jsonb_set(
          COALESCE(dados_completos_json, '{}'),
          '{itens}',
          '[]'
        ), atualizado_em = now()
        WHERE id = ${pedidoId}
      `).catch(() => {});
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
