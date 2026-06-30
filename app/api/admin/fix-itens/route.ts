import { NextResponse } from 'next/server';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db/client';
import { pedidoItens } from '@/db/schema';
import { auth } from '@/lib/auth';
import { getPedido } from '@/lib/bling/client';

// POST /api/admin/fix-itens
// Header X-Pedido-Numero: 28564
// Re-busca itens de um pedido especifico da API do Bling.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return new NextResponse('forbidden', { status: 403 });
  }

  const numero = req.headers.get('x-pedido-numero');
  if (!numero) {
    return NextResponse.json({ ok: false, erro: 'Header X-Pedido-Numero obrigatorio' }, { status: 400 });
  }

  const rows = await db.execute<{ id: number; id_bling: number }>(drizzleSql`
    SELECT id, id_bling FROM pedidos WHERE numero = ${numero} LIMIT 1
  `);
  const row = (rows[0] as { id: number; id_bling: number } | undefined);
  if (!row) {
    return NextResponse.json({ ok: false, erro: `Pedido #${numero} nao encontrado` }, { status: 404 });
  }

  const pedidoId = Number(row.id);
  const idBling = Number(row.id_bling);

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
  }

  return NextResponse.json({ ok: true, pedidoId, idBling, itens: blingPedido.itens?.length ?? 0 });
}
