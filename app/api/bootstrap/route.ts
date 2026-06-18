/**
 * Endpoint temporário de bootstrap — importa NDJSON de contatos/pedidos via HTTP.
 * Usar apenas uma vez para carga inicial. Protegido por X-N8N-Secret.
 * Remoção planejada após carga (Spec §24).
 */
import { NextResponse } from 'next/server';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db/client';
import { contatos, pedidos, pedidoItens } from '@/db/schema';
import { mapContato, mapPedido } from '@/lib/bling/mapper';
import { verifyN8nSecret } from '@/lib/n8n/trigger';
import type { BlingContato, BlingPedidoVenda } from '@/lib/bling/types';

const BATCH = 200;

export async function POST(req: Request) {
  if (!verifyN8nSecret(req)) {
    return new NextResponse('forbidden', { status: 403 });
  }

  const tipo = req.headers.get('X-Bootstrap-Type');
  if (tipo !== 'contatos' && tipo !== 'pedidos' && tipo !== 'status') {
    return NextResponse.json({ error: 'X-Bootstrap-Type deve ser contatos|pedidos|status' }, { status: 400 });
  }

  if (tipo === 'status') {
    const nc = (await db.execute<{ nc: number }>(drizzleSql`SELECT count(*)::int AS nc FROM contatos`))[0]?.nc ?? 0;
    const np = (await db.execute<{ np: number }>(drizzleSql`SELECT count(*)::int AS np FROM pedidos`))[0]?.np ?? 0;
    const ni = (await db.execute<{ ni: number }>(drizzleSql`SELECT count(*)::int AS ni FROM pedido_itens`))[0]?.ni ?? 0;
    return NextResponse.json({ contatos: nc, pedidos: np, pedido_itens: ni });
  }

  const text = await req.text();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  if (tipo === 'contatos') {
    return handleContatos(lines);
  } else {
    return handlePedidos(lines);
  }
}

async function handleContatos(lines: string[]) {
  let processed = 0;
  let errors = 0;
  const batch: ReturnType<typeof mapContato>[] = [];

  async function flush() {
    if (!batch.length) return;
    await db
      .insert(contatos)
      .values(batch)
      .onConflictDoUpdate({
        target: contatos.idBling,
        set: {
          nome: drizzleSql`excluded.nome`,
          telefone: drizzleSql`excluded.telefone`,
          email: drizzleSql`excluded.email`,
          situacaoBling: drizzleSql`excluded.situacao_bling`,
          dadosExtrasJson: drizzleSql`excluded.dados_extras_json`,
          atualizadoEm: drizzleSql`now()`,
        },
      });
    batch.length = 0;
  }

  for (const line of lines) {
    try {
      const raw = JSON.parse(line) as BlingContato;
      batch.push(mapContato(raw));
      processed++;
      if (batch.length >= BATCH) await flush();
    } catch {
      errors++;
    }
  }
  await flush();

  return NextResponse.json({ ok: true, tipo: 'contatos', processed, errors });
}

async function handlePedidos(lines: string[]) {
  // Carrega mapa idBling → id interno para resolver contatoId
  const rows = await db.select({ id: contatos.id, idBling: contatos.idBling }).from(contatos);
  const contatoMap = new Map<number, number>(rows.map(r => [r.idBling, r.id]));

  let processed = 0;
  let errors = 0;
  const pedidoBatch: typeof pedidos.$inferInsert[] = [];
  const itensByIdBling = new Map<number, typeof pedidoItens.$inferInsert[]>();

  async function flush() {
    if (!pedidoBatch.length) return;
    const inserted = await db
      .insert(pedidos)
      .values(pedidoBatch)
      .onConflictDoUpdate({
        target: pedidos.idBling,
        set: {
          contatoId: drizzleSql`excluded.contato_id`,
          numero: drizzleSql`excluded.numero`,
          data: drizzleSql`excluded.data`,
          dataSaida: drizzleSql`excluded.data_saida`,
          situacaoId: drizzleSql`excluded.situacao_id`,
          situacaoValor: drizzleSql`excluded.situacao_valor`,
          total: drizzleSql`excluded.total`,
          totalProdutos: drizzleSql`excluded.total_produtos`,
          dadosCompletosJson: drizzleSql`excluded.dados_completos_json`,
          atualizadoEm: drizzleSql`now()`,
        },
      })
      .returning({ id: pedidos.id, idBling: pedidos.idBling });

    const itensBatch: typeof pedidoItens.$inferInsert[] = [];
    for (const r of inserted) {
      const itens = itensByIdBling.get(r.idBling!) ?? [];
      for (const item of itens) {
        itensBatch.push({ ...item, pedidoId: r.id });
      }
    }
    if (itensBatch.length) {
      await db.insert(pedidoItens).values(itensBatch).onConflictDoNothing();
    }

    pedidoBatch.length = 0;
    itensByIdBling.clear();
  }

  for (const line of lines) {
    try {
      const raw = JSON.parse(line) as BlingPedidoVenda;
      const contatoId = contatoMap.get(Number(raw.contato?.id));
      if (!contatoId) { errors++; continue; }

      const { pedido, itens } = mapPedido(raw, contatoId);
      pedidoBatch.push(pedido);
      itensByIdBling.set(pedido.idBling!, itens.map(i => ({ ...i, pedidoId: 0 })));
      processed++;
      if (pedidoBatch.length >= BATCH) await flush();
    } catch {
      errors++;
    }
  }
  await flush();

  return NextResponse.json({ ok: true, tipo: 'pedidos', processed, errors });
}
