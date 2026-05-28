import { NextResponse } from 'next/server';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { cards, contatos, pedidoItens, pedidos } from '@/db/schema';
import { logEvent } from '@/lib/audit';
import { getFlag, setFlag } from '@/lib/feature-flags';
import { listPedidos } from '@/lib/bling/client';
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

  const lastSyncRaw = await getFlag('BLING_LAST_SYNC_AT');
  const dataAlteracaoInicial = lastSyncRaw && lastSyncRaw !== ''
    ? new Date(lastSyncRaw).toISOString().slice(0, 10)
    : isoDateDaysAgo(7);

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
    }

    if (resp.data.length < PAGE_LIMIT) break;
    pagina++;
    if (pagina > 100) break; // sanity
  }

  await setFlag('BLING_LAST_SYNC_AT', inicioSync.toISOString());
  await logEvent({
    tipo: 'sync_delta',
    origem: 'n8n_cron',
    externalId: `delta-${inicioSync.toISOString().slice(0, 13)}`,
    payload: { totalProcessados, novosCards, dataAlteracaoInicial },
  });

  return NextResponse.json({
    ok: true,
    totalProcessados,
    novosCards,
    dataAlteracaoInicial,
    syncedAt: inicioSync.toISOString(),
  });
}

function isoDateDaysAgo(n: number): string {
  const d = new Date(Date.now() - n * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

interface UpsertResult {
  cardCriado: boolean;
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
          dadosCompletosJson: pedido.dadosCompletosJson,
          atualizadoEm: drizzleSql`now()`,
        },
      })
      .returning({ id: pedidos.id, situacaoValor: pedidos.situacaoValor });
    const pedidoLocal = insertedPedido[0]!;

    if (itens.length > 0) {
      await tx.delete(pedidoItens).where(drizzleSql`pedido_id = ${pedidoLocal.id}`);
      await tx.insert(pedidoItens).values(itens.map((i) => ({ ...i, pedidoId: pedidoLocal.id })));
    }

    if (pedidoLocal.situacaoValor !== SITUACAO_VALOR.ATENDIDO) {
      return { cardCriado: false };
    }

    if (contatoLocal.freezingAte && contatoLocal.freezingAte.getTime() > Date.now()) {
      return { cardCriado: false };
    }

    // Já existe card ativo? Idempotência: nada a fazer.
    const cardAtivo = await tx
      .select()
      .from(cards)
      .where(drizzleSql`contato_id = ${contatoLocal.id} AND coluna != 'arquivo'`)
      .limit(1);

    if (cardAtivo[0] && cardAtivo[0].pedidoIdOrigem === pedidoLocal.id) {
      return { cardCriado: false };
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
    });

    return { cardCriado: true };
  });
}
