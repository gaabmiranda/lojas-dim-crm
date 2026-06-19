import { NextResponse } from 'next/server';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { cards, contatos, pedidoItens, pedidos, vendedoresBling } from '@/db/schema';
import { logEvent } from '@/lib/audit';
import { getFlag, setFlag } from '@/lib/feature-flags';
import { getPedido, listPedidos } from '@/lib/bling/client';
import { mapContato, mapPedido } from '@/lib/bling/mapper';
import { SITUACAO_VALOR } from '@/lib/bling/types';
import { verifyN8nSecret } from '@/lib/n8n/trigger';
import { transicaoPorNovaCompra } from '@/lib/kanban';

const PAGE_LIMIT = 100;

export async function POST(req: Request) {
  if (!verifyN8nSecret(req)) {
    return new NextResponse('forbidden', { status: 403 });
  }

  const enabled = await getFlag('BLING_POLLING_ATIVO');
  if (enabled === 'false') {
    return NextResponse.json({ ok: true, skipped: 'polling desativado' });
  }

  // ?desde=YYYY-MM-DD força data inicial (modo retroativo) sem atualizar BLING_LAST_SYNC_AT
  const url = new URL(req.url);
  const desdeParam = url.searchParams.get('desde');
  const modoRetroativo = !!desdeParam;

  const lastSyncRaw = await getFlag('BLING_LAST_SYNC_AT');
  const dataAlteracaoInicial = desdeParam
    ? desdeParam
    : (lastSyncRaw && lastSyncRaw !== ''
        ? new Date(lastSyncRaw).toISOString().slice(0, 10)
        : isoDateDaysAgo(7));

  let pagina = 1;
  let totalProcessados = 0;
  let novosCards = 0;
  const inicioSync = new Date();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const resp = await listPedidos({
      pagina,
      limite: PAGE_LIMIT,
      dataAlteracaoInicial,
    });
    if (!resp.data || resp.data.length === 0) break;

    for (const blingPedido of resp.data) {
      const result = await upsertPedidoBling(blingPedido);
      totalProcessados++;
      if (result?.cardCriado) novosCards++;
      if (result?.needsItemFetch) {
        await fetchAndSaveItens(result.pedidoId, result.idBling);
      }
    }

    if (resp.data.length < PAGE_LIMIT) break;
    pagina++;
    if (pagina > 500) break; // sanity (retroativo pode ter muitas páginas)
  }

  // Modo retroativo não avança o ponteiro de sync
  if (!modoRetroativo) {
    await setFlag('BLING_LAST_SYNC_AT', inicioSync.toISOString());
  }

  await logEvent({
    tipo: modoRetroativo ? 'sync_retroativo' : 'sync_delta',
    origem: modoRetroativo ? 'retroativo' : 'n8n_cron',
    externalId: `delta-${inicioSync.toISOString().slice(0, 13)}`,
    payload: { totalProcessados, novosCards, dataAlteracaoInicial, modoRetroativo },
  });

  return NextResponse.json({
    ok: true,
    totalProcessados,
    novosCards,
    dataAlteracaoInicial,
    modoRetroativo,
    syncedAt: inicioSync.toISOString(),
  });
}

function isoDateDaysAgo(n: number): string {
  const d = new Date(Date.now() - n * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

interface UpsertResult {
  cardCriado: boolean;
  pedidoId: number;
  idBling: number;
  needsItemFetch: boolean;
}

async function upsertPedidoBling(blingPedido: import('@/lib/bling/types').BlingPedidoVenda): Promise<UpsertResult | null> {
  return await db.transaction(async (tx) => {
    const stubContato = mapContato({
      id: blingPedido.contato.id,
      nome: blingPedido.contato.nome,
      situacao: 'A',
    });
    const insertedContato = await tx
      .insert(contatos)
      .values(stubContato)
      .onConflictDoUpdate({
        target: contatos.idBling,
        set: {
          nome: stubContato.nome,
          atualizadoEm: drizzleSql`now()`,
        },
      })
      .returning({ id: contatos.id, freezingAte: contatos.freezingAte });
    const contatoLocal = insertedContato[0]!;

    const { pedido, itens } = mapPedido(blingPedido, contatoLocal.id);
    const insertedPedido = await tx
      .insert(pedidos)
      .values(pedido)
      .onConflictDoUpdate({
        target: pedidos.idBling,
        set: {
          numero: pedido.numero,
          data: pedido.data,
          dataSaida: pedido.dataSaida,
          situacaoId: pedido.situacaoId,
          situacaoValor: pedido.situacaoValor,
          total: pedido.total,
          totalProdutos: pedido.totalProdutos,
          // dadosCompletosJson omitido: preserva dados buscados individualmente (com itens)
          atualizadoEm: drizzleSql`now()`,
        },
      })
      .returning({ id: pedidos.id, situacaoId: pedidos.situacaoId, dadosCompletosJson: pedidos.dadosCompletosJson });
    const pedidoLocal = insertedPedido[0]!;

    // Determina se itens precisam ser buscados individualmente.
    // A API de listagem não retorna itens; só o GET individual inclui esse campo.
    const jsonAtual = pedidoLocal.dadosCompletosJson as Record<string, unknown> | null;
    const needsItemFetch = !jsonAtual || !('itens' in jsonAtual);

    if (itens.length > 0) {
      await tx.delete(pedidoItens).where(drizzleSql`pedido_id = ${pedidoLocal.id}`);
      await tx.insert(pedidoItens).values(itens.map((i) => ({ ...i, pedidoId: pedidoLocal.id })));
    }

    const idBling = Number(blingPedido.id);

    if (pedidoLocal.situacaoId !== SITUACAO_VALOR.ATENDIDO) {
      return { cardCriado: false, pedidoId: pedidoLocal.id, idBling, needsItemFetch };
    }

    if (contatoLocal.freezingAte && contatoLocal.freezingAte.getTime() > Date.now()) {
      return { cardCriado: false, pedidoId: pedidoLocal.id, idBling, needsItemFetch };
    }

    // Já existe card ativo? Idempotência: nada a fazer.
    const cardAtivo = await tx
      .select()
      .from(cards)
      .where(drizzleSql`contato_id = ${contatoLocal.id} AND coluna != 'arquivo'`)
      .limit(1);

    if (cardAtivo[0] && cardAtivo[0].pedidoIdOrigem === pedidoLocal.id) {
      return { cardCriado: false, pedidoId: pedidoLocal.id, idBling, needsItemFetch };
    }

    const transicao = transicaoPorNovaCompra(
      { id: contatoLocal.id, freezingAte: contatoLocal.freezingAte },
      {
        id: pedidoLocal.id,
        contatoId: contatoLocal.id,
        dataSaida: pedido.dataSaida ?? null,
        data: pedido.data ?? null,
      },
      cardAtivo[0]
        ? {
            id: cardAtivo[0].id,
            contatoId: cardAtivo[0].contatoId,
            tipo: cardAtivo[0].tipo,
            coluna: cardAtivo[0].coluna,
            tentativasReativacao: cardAtivo[0].tentativasReativacao,
            dataPrevistaAcao: cardAtivo[0].dataPrevistaAcao,
            atualizadoEm: cardAtivo[0].atualizadoEm,
          }
        : null,
    );

    // Resolve vendedor: upsert no lookup, busca id; se não vier do Bling → round-robin
    let vendedorId: number | null = null;
    if (blingPedido.vendedor?.id) {
      await tx.insert(vendedoresBling).values({
        idBling: blingPedido.vendedor.id,
        contatoIdBling: blingPedido.vendedor.contato?.id ?? null,
        contatoNome: blingPedido.vendedor.contato?.nome ?? null,
      }).onConflictDoUpdate({
        target: vendedoresBling.idBling,
        set: { contatoNome: drizzleSql`excluded.contato_nome` },
      });
      const vb = await tx.select({ id: vendedoresBling.id })
        .from(vendedoresBling)
        .where(eq(vendedoresBling.idBling, blingPedido.vendedor.id))
        .limit(1);
      vendedorId = vb[0]?.id ?? null;
    }
    if (!vendedorId) {
      // Round-robin: atribui ao vendedor com menos cards ativos
      const least = await tx.execute<{ id: number }>(drizzleSql`
        SELECT vb.id FROM vendedores_bling vb
        LEFT JOIN cards c ON c.vendedor_id = vb.id AND c.coluna != 'arquivo'
        GROUP BY vb.id ORDER BY count(c.id) ASC, vb.id ASC LIMIT 1
      `);
      vendedorId = (least[0] as { id: number } | undefined)?.id ?? null;
    }

    if (transicao.cancelarCardId) {
      await tx
        .update(cards)
        .set({ coluna: 'arquivo', atualizadoEm: drizzleSql`now()` })
        .where(eq(cards.id, transicao.cancelarCardId));
    }

    await tx.insert(cards).values({
      contatoId: transicao.criarNovoCard.contatoId,
      pedidoIdOrigem: transicao.criarNovoCard.pedidoIdOrigem,
      tipo: 'pos_venda',
      coluna: 'pendente',
      nomeExibido: blingPedido.contato.nome ?? `Cliente #${contatoLocal.id}`,
      dataPrevistaAcao: transicao.criarNovoCard.dataPrevistaAcao,
      tentativasReativacao: 0,
      vendedorId,
    });

    return { cardCriado: true, pedidoId: pedidoLocal.id, idBling, needsItemFetch };
  });
}

async function fetchAndSaveItens(pedidoId: number, idBling: number): Promise<void> {
  try {
    const fullPedido = await getPedido(idBling);
    await db.execute(drizzleSql`
      UPDATE pedidos SET dados_completos_json = ${JSON.stringify(fullPedido)}::jsonb,
      atualizado_em = now() WHERE id = ${pedidoId}
    `);
    if (fullPedido.itens && fullPedido.itens.length > 0) {
      await db.delete(pedidoItens).where(drizzleSql`pedido_id = ${pedidoId}`);
      await db.insert(pedidoItens).values(
        fullPedido.itens.map((i) => ({
          pedidoId,
          descricao: i.descricao,
          quantidade: String(i.quantidade ?? 0),
          valorUnitario: String(i.valor ?? 0),
          valorTotal: String((i.quantidade ?? 0) * (i.valor ?? 0)),
        })),
      );
    }
  } catch (err) {
    console.error(`[delta-sync] fetchAndSaveItens pedido ${pedidoId} (bling ${idBling}):`, err);
    // Marca itens:[] para não re-tentar em loop em pedidos que a API não retorna.
    await db.execute(drizzleSql`
      UPDATE pedidos SET dados_completos_json = jsonb_set(
        COALESCE(dados_completos_json, '{}'), '{itens}', '[]'
      ), atualizado_em = now() WHERE id = ${pedidoId}
    `).catch(() => {});
  }
}
