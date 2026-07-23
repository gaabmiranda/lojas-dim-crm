import { NextResponse } from 'next/server';
import { and, eq, gte, lte, ne, sql as drizzleSql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { cards, contatos } from '@/db/schema';
import { logEvent } from '@/lib/audit';
import { DIAS_REATIVACAO } from '@/lib/kanban';
import { verifyN8nSecret } from '@/lib/n8n/trigger';
import { addDays, addHours, proximoAniversario, nowBRT } from '@/lib/time';

const bodySchema = z.object({
  tipo: z.enum(['d14', 'sem_resposta', 'reativacao', 'arquivar']),
});

const BATCH = 100;
const MAX_TENTATIVAS_REATIVACAO = 3;

export async function POST(req: Request) {
  if (!verifyN8nSecret(req)) {
    return new NextResponse('forbidden', { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { tipo } = parsed.data;
  const agora = new Date();

  switch (tipo) {
    case 'd14':
      return handleD14(agora);
    case 'sem_resposta':
      return handleSemResposta(agora);
    case 'reativacao':
      return handleReativacao(agora);
    case 'arquivar':
      return handleArquivar(agora);
  }
}

// ── d14 ────────────────────────────────────────────────────────────────────
// Cron 02 (8h BRT): pos_venda em 'pendente' com DPA vencida → move para 'em_contato'.
// DPA nova = +48h (janela de resposta para o cron sem_resposta).
async function handleD14(agora: Date) {
  const candidatos = await db
    .select({ id: cards.id })
    .from(cards)
    .where(
      and(
        eq(cards.coluna, 'pendente'),
        eq(cards.tipo, 'pos_venda'),
        lte(cards.dataPrevistaAcao, agora),
      ),
    )
    .limit(BATCH);

  let processados = 0;
  let aplicados = 0;
  let pulados = 0;

  for (const card of candidatos) {
    processados++;
    const date = agora.toISOString().slice(0, 10);
    const audit = await logEvent({
      tipo: 'cron_d14',
      origem: 'n8n_cron',
      externalId: `${card.id}-d14-${date}`,
      cardId: card.id,
      payload: {},
    });
    if (audit.duplicate) {
      pulados++;
      continue;
    }

    try {
      await db
        .update(cards)
        .set({
          coluna: 'em_contato',
          dataPrevistaAcao: addHours(agora, 48).toJSDate(),
          colunaDeSde: drizzleSql`now()`,
          atualizadoEm: drizzleSql`now()`,
        })
        .where(eq(cards.id, card.id));
      aplicados++;
    } catch (err) {
      console.error('[cron-d14] erro', card.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    tipo: 'd14',
    processados,
    aplicados,
    pulados,
    temMais: processados === BATCH,
  });
}

// ── sem_resposta ────────────────────────────────────────────────────────────
// Cron 03 (9h BRT): cards em 'em_contato' com DPA vencida (48h sem retorno)
// → move para 'finalizado'. DPA nova = +90d para o cron reativacao pegar.
async function handleSemResposta(agora: Date) {
  const candidatos = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.coluna, 'em_contato'), lte(cards.dataPrevistaAcao, agora)))
    .limit(BATCH);

  let processados = 0;
  let aplicados = 0;
  let pulados = 0;

  for (const card of candidatos) {
    processados++;
    const date = agora.toISOString().slice(0, 10);
    const audit = await logEvent({
      tipo: 'cron_sem_resposta',
      origem: 'n8n_cron',
      externalId: `${card.id}-sem_resposta-${date}`,
      cardId: card.id,
      payload: {},
    });
    if (audit.duplicate) {
      pulados++;
      continue;
    }

    try {
      await db
        .update(cards)
        .set({
          coluna: 'finalizado',
          dataPrevistaAcao: addDays(agora, DIAS_REATIVACAO).toJSDate(),
          colunaDeSde: drizzleSql`now()`,
          atualizadoEm: drizzleSql`now()`,
        })
        .where(eq(cards.id, card.id));
      aplicados++;
    } catch (err) {
      console.error('[cron-sem-resposta] erro', card.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    tipo: 'sem_resposta',
    processados,
    aplicados,
    pulados,
    temMais: processados === BATCH,
  });
}

// ── reativacao ──────────────────────────────────────────────────────────────
// Cron 04 (10h BRT): cards em 'finalizado' com DPA vencida → arquiva e cria
// card de reativacao D+90. Cards de aniversario renovam para o próximo ano.
async function handleReativacao(agora: Date) {
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
    const date = agora.toISOString().slice(0, 10);
    const audit = await logEvent({
      tipo: 'cron_reativacao',
      origem: 'n8n_cron',
      externalId: `${card.id}-reativacao-${date}`,
      cardId: card.id,
      payload: {},
    });
    if (audit.duplicate) {
      pulados++;
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(cards)
          .set({ coluna: 'arquivo', atualizadoEm: drizzleSql`now()`, colunaDeSde: drizzleSql`now()` })
          .where(eq(cards.id, card.id));

        if (card.tipo === 'aniversario') {
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
            if ((err as { code?: string }).code !== '23505') throw err;
            console.warn(`[cron-reativacao] card ativo já existe para contato ${card.contatoId}, ignorando`);
          }
        }
      });
      aplicados++;
    } catch (err) {
      console.error('[cron-reativacao] erro aplicando', card.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    tipo: 'reativacao',
    processados,
    aplicados,
    pulados,
    temMais: processados === BATCH,
  });
}

// ── arquivar ────────────────────────────────────────────────────────────────
// Cron 05 (11h BRT): cards de reativacao com 3+ tentativas que não converteram
// → arquiva (exit strategy, não recebem mais mensagens).
async function handleArquivar(agora: Date) {
  const candidatos = await db
    .select({ id: cards.id })
    .from(cards)
    .where(
      and(
        eq(cards.tipo, 'reativacao'),
        ne(cards.coluna, 'arquivo'),
        gte(cards.tentativasReativacao, MAX_TENTATIVAS_REATIVACAO),
      ),
    )
    .limit(BATCH);

  let processados = 0;
  let aplicados = 0;
  let pulados = 0;

  for (const card of candidatos) {
    processados++;
    const date = agora.toISOString().slice(0, 10);
    const audit = await logEvent({
      tipo: 'cron_arquivar',
      origem: 'n8n_cron',
      externalId: `${card.id}-arquivar-${date}`,
      cardId: card.id,
      payload: { motivo: 'max_tentativas' },
    });
    if (audit.duplicate) {
      pulados++;
      continue;
    }

    try {
      await db
        .update(cards)
        .set({
          coluna: 'arquivo',
          colunaDeSde: drizzleSql`now()`,
          atualizadoEm: drizzleSql`now()`,
        })
        .where(eq(cards.id, card.id));
      aplicados++;
    } catch (err) {
      console.error('[cron-arquivar] erro', card.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    tipo: 'arquivar',
    processados,
    aplicados,
    pulados,
    temMais: processados === BATCH,
  });
}
