import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { cards, contatos, pedidoItens, pedidos } from '@/db/schema';
import { logEvent } from '@/lib/audit';
import { getPedido } from '@/lib/bling/client';
import { mapContato, mapPedido } from '@/lib/bling/mapper';
import { SITUACAO_VALOR } from '@/lib/bling/types';
import { blingWebhookSchema } from '@/lib/validators/bling-webhook';
import { transicaoPorNovaCompra } from '@/lib/kanban';

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyHmac(rawBody: string, signature: string | null): boolean {
  const secret = process.env.BLING_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Aceita header com ou sem prefixo "sha256=".
  const provided = signature.replace(/^sha256=/, '');
  return timingSafeEqual(computed, provided);
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-bling-signature') ?? req.headers.get('X-Bling-Signature');

  if (!verifyHmac(rawBody, signature)) {
    return new NextResponse('invalid signature', { status: 401 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return new NextResponse('invalid json', { status: 400 });
  }

  const parsed = blingWebhookSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid payload', details: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const externalId = `${payload.evento}-${String(payload.dados?.id ?? 'unknown')}-${payload.data ?? ''}`;

  // Idempotência: 200 mesmo em duplicate (evita retries excessivos do Bling).
  const audit = await logEvent({
    tipo: payload.evento,
    origem: 'bling_webhook',
    externalId,
    payload: payload as unknown as Record<string, unknown>,
  });
  if (audit.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    if (payload.evento === 'pedido_venda.alterado' || payload.evento === 'pedido_venda.criado') {
      const pedidoIdBling = payload.dados?.id;
      if (pedidoIdBling != null) {
        await processarPedidoBling(pedidoIdBling);
      }
    } else if (payload.evento === 'contato.alterado' || payload.evento === 'contato.criado') {
      // Contato: o payload básico do webhook não tem dados completos. Marcamos como pendente.
      // Resync via /api/sync/bling/delta fará a leitura completa.
    }
  } catch (err) {
    console.error('[bling-webhook] erro processando', payload.evento, err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function processarPedidoBling(pedidoIdBling: number): Promise<void> {
  const blingPedido = await getPedido(pedidoIdBling);

  await db.transaction(async (tx) => {
    // Upsert contato (stub se necessário).
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

    // Upsert pedido + itens.
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

    // Só cria card se o pedido está ATENDIDO (regra de negócio AC1).
    if (pedidoLocal.situacaoValor === SITUACAO_VALOR.ATENDIDO) {
      // Freezing: ignora criação de card se contato está congelado.
      if (
        contatoLocal.freezingAte &&
        contatoLocal.freezingAte.getTime() > Date.now()
      ) {
        return;
      }

      // Procura card ativo desse contato (qualquer coluna != arquivo).
      const cardAtivo = await tx
        .select()
        .from(cards)
        .where(drizzleSql`contato_id = ${contatoLocal.id} AND coluna != 'arquivo'`)
        .limit(1);

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
    }
  });
}
