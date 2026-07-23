import { NextResponse } from 'next/server';
import { and, eq, lte, sql as drizzleSql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { cards, contatos } from '@/db/schema';
import { logEvent } from '@/lib/audit';
import { proximaTransicaoAutomatica, DIAS_REATIVACAO, type CardInput } from '@/lib/kanban';
import { verifyN8nSecret } from '@/lib/n8n/trigger';
import { addDays, proximoAniversario, nowBRT } from '@/lib/time';

const bodySchema = z.object({
  tipo: z.enum(['criar_reativacao']),
});

const BATCH = 100;

// Cron único: detecta cards em 'finalizado' com dataPrevistaAcao vencida
// e cria o card de reativação D+90. Chamado pelo n8n periodicamente.
export async function POST(req: Request) {
  if (!verifyN8nSecret(req)) {
    return new NextResponse('forbidden', { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const agora = new Date();

  const candidatos = await db
    .select({
      id: cards.id,
      contatoId: cards.contatoId,
      tipo: cards.tipo,
      coluna: cards.coluna,
      tentativasReativacao: cards.tentativasReativacao,
      dataPrevistaAcao: cards.dataPrevistaAcao,
      atualizadoEm: cards.atualizadoEm,
      nomeExibido: cards.nomeExibido,
      vendedorId: cards.vendedorId,
    })
    .from(cards)
    .where(and(eq(cards.coluna, 'finalizado'), lte(cards.dataPrevistaAcao, agora)))
    .limit(BATCH);

  let processados = 0;
  let aplicados = 0;
  let pulados = 0;

  for (const card of candidatos) {
    processados++;
    const transicao = proximaTransicaoAutomatica(card as CardInput, agora);
    if (!transicao) {
      pulados++;
      continue;
    }

    // Idempotência intra-dia: mesmo card + tipo + dia já processado vira no-op.
    const dataYYYYMMDD = agora.toISOString().slice(0, 10);
    const externalId = `${card.id}-criar_reativacao-${dataYYYYMMDD}`;
    const audit = await logEvent({
      tipo: 'cron_criar_reativacao',
      origem: 'n8n_cron',
      externalId,
      cardId: card.id,
      payload: { transicao: transicao.tipo },
    });
    if (audit.duplicate) {
      pulados++;
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        // Arquiva o card finalizado.
        await tx
          .update(cards)
          .set({ coluna: 'arquivo', atualizadoEm: drizzleSql`now()`, colunaDeSde: drizzleSql`now()` })
          .where(eq(cards.id, card.id));

        if (card.tipo === 'aniversario') {
          // Renova para o próximo ano em 'pausado'
          const [contatoRow] = await tx
            .select({ dataAniversario: contatos.dataAniversario })
            .from(contatos)
            .where(eq(contatos.id, card.contatoId))
            .limit(1);
          if (contatoRow?.dataAniversario) {
            const proximo = proximoAniversario(contatoRow.dataAniversario, nowBRT());
            try {
              await tx.insert(cards).values({
                contatoId: card.contatoId,
                tipo: 'aniversario',
                coluna: 'pausado',
                nomeExibido: card.nomeExibido,
                dataPrevistaAcao: proximo.toJSDate(),
                tentativasReativacao: 0,
                vendedorId: card.vendedorId,
              });
            } catch (err) {
              if ((err as { code?: string }).code !== '23505') throw err;
            }
          }
          // Ativa o próximo card pausado (pode ser o aniversário recém-renovado ou outro)
          const [nextPausado] = await tx
            .select({ id: cards.id })
            .from(cards)
            .where(drizzleSql`contato_id = ${card.contatoId} AND coluna = 'pausado'`)
            .orderBy(cards.dataPrevistaAcao)
            .limit(1);
          if (nextPausado) {
            await tx
              .update(cards)
              .set({ coluna: 'pendente', colunaDeSde: drizzleSql`now()`, atualizadoEm: drizzleSql`now()` })
              .where(eq(cards.id, nextPausado.id));
          }
        } else {
          // Cria reativação D+90 na primeira coluna do funil.
          const dpa = addDays(agora, DIAS_REATIVACAO).toJSDate();
          try {
            await tx.insert(cards).values({
              contatoId: card.contatoId,
              tipo: 'reativacao',
              coluna: 'pendente',
              nomeExibido: `Reativação · ${card.nomeExibido ?? `contato ${card.contatoId}`}`,
              dataPrevistaAcao: dpa,
              tentativasReativacao: 0,
              vendedorId: card.vendedorId,
            });
          } catch (err) {
            // 23505: já existe card ativo para este contato → noop legítimo.
            if ((err as { code?: string }).code !== '23505') throw err;
            console.warn(`[cron-reativacao] card ativo já existe para contato ${card.contatoId}, ignorando`);
          }
        }
      });
      aplicados++;
    } catch (err) {
      console.error('[cron-transitions] erro aplicando', card.id, err);
    }
  }

  return NextResponse.json({ ok: true, processados, aplicados, pulados });
}
