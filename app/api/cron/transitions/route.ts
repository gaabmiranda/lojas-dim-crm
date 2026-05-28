import { NextResponse } from 'next/server';
import { and, eq, lte, sql as drizzleSql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { cards, contatos } from '@/db/schema';
import { logEvent } from '@/lib/audit';
import {
  proximaTransicaoAutomatica,
  type CardInput,
  type Transicao,
} from '@/lib/kanban';
import { openOrCreateConversation } from '@/lib/chatwoot/client';
import { renderTemplate } from '@/lib/templates';
import { verifyN8nSecret } from '@/lib/n8n/trigger';
import { addHours } from '@/lib/time';
import { HORAS_SEM_RESPOSTA } from '@/lib/kanban';

const bodySchema = z.object({
  tipo: z.enum(['d14', 'sem_resposta', 'reativacao', 'arquivar']),
});

const BATCH = 100;

// 1 endpoint, 4 chamadas n8n (cada workflow chama com seu `tipo`).
// Decisão Spec #6/#15: lógica de transição mora no CRM, n8n é só timer.
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
  const limite48hAtras = addHours(agora, -HORAS_SEM_RESPOSTA).toJSDate();
  const candidatos = await selecionarCandidatos(tipo, agora, limite48hAtras);

  let processados = 0;
  let aplicados = 0;
  let pulados = 0;

  for (const card of candidatos) {
    processados++;
    const transicao = proximaTransicaoAutomatica(card, agora);
    if (!transicao) {
      pulados++;
      continue;
    }
    // Idempotência intra-dia: mesmo card + tipo + dia já processado vira no-op.
    const dataYYYYMMDD = agora.toISOString().slice(0, 10);
    const externalId = `${card.id}-${tipo}-${dataYYYYMMDD}`;
    const audit = await logEvent({
      tipo: `cron_${tipo}`,
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
      await aplicarTransicao(card, transicao);
      aplicados++;
    } catch (err) {
      console.error('[cron-transitions] erro aplicando', card.id, transicao.tipo, err);
    }
  }

  return NextResponse.json({ ok: true, tipo, processados, aplicados, pulados });
}

async function selecionarCandidatos(
  tipo: 'd14' | 'sem_resposta' | 'reativacao' | 'arquivar',
  agora: Date,
  limite48h: Date,
): Promise<CardInput[]> {
  const base = {
    where: undefined as ReturnType<typeof and> | undefined,
  };

  if (tipo === 'd14') {
    base.where = and(
      eq(cards.tipo, 'pos_venda'),
      eq(cards.coluna, 'pendente'),
      lte(cards.dataPrevistaAcao, agora),
    );
  } else if (tipo === 'sem_resposta') {
    base.where = and(
      eq(cards.coluna, 'em_contato'),
      lte(cards.atualizadoEm, limite48h),
    );
  } else if (tipo === 'reativacao') {
    base.where = and(
      eq(cards.tipo, 'reativacao'),
      eq(cards.coluna, 'pendente'),
      lte(cards.dataPrevistaAcao, agora),
    );
  } else {
    // arquivar
    base.where = and(
      eq(cards.tipo, 'reativacao'),
      eq(cards.coluna, 'em_contato'),
      lte(cards.atualizadoEm, limite48h),
    );
  }

  const rows = await db
    .select({
      id: cards.id,
      contatoId: cards.contatoId,
      tipo: cards.tipo,
      coluna: cards.coluna,
      tentativasReativacao: cards.tentativasReativacao,
      dataPrevistaAcao: cards.dataPrevistaAcao,
      atualizadoEm: cards.atualizadoEm,
    })
    .from(cards)
    .where(base.where)
    .limit(BATCH);

  return rows;
}

async function aplicarTransicao(card: CardInput, t: Transicao): Promise<void> {
  await db.transaction(async (tx) => {
    if (t.tipo === 'enviar_mensagem_d14') {
      await tx
        .update(cards)
        .set({ coluna: 'em_contato', atualizadoEm: drizzleSql`now()` })
        .where(eq(cards.id, t.cardId));
      await dispararMensagem(card, t.template);
    } else if (t.tipo === 'finalizar_sem_resposta_pv') {
      await tx
        .update(cards)
        .set({ coluna: 'finalizado', atualizadoEm: drizzleSql`now()` })
        .where(eq(cards.id, t.cardId));
      await tx.insert(cards).values({
        contatoId: t.criarNovoCard.contatoId,
        tipo: 'reativacao',
        coluna: 'pendente',
        nomeExibido: `Reativação · contato ${t.criarNovoCard.contatoId}`,
        dataPrevistaAcao: t.criarNovoCard.dataPrevistaAcao,
        tentativasReativacao: 0,
      });
    } else if (t.tipo === 'enviar_reativacao') {
      await tx
        .update(cards)
        .set({
          coluna: 'em_contato',
          tentativasReativacao: t.novaTentativasReativacao,
          atualizadoEm: drizzleSql`now()`,
        })
        .where(eq(cards.id, t.cardId));
      await dispararMensagem(card, t.template);
    } else if (t.tipo === 'reagendar_reativacao') {
      await tx
        .update(cards)
        .set({
          coluna: 'pendente',
          dataPrevistaAcao: t.novaDataPrevistaAcao,
          atualizadoEm: drizzleSql`now()`,
        })
        .where(eq(cards.id, t.cardId));
    } else if (t.tipo === 'arquivar_reativacao') {
      await tx
        .update(cards)
        .set({ coluna: 'arquivo', atualizadoEm: drizzleSql`now()` })
        .where(eq(cards.id, t.cardId));
      await tx
        .update(contatos)
        .set({ freezingAte: t.freezingContatoAte })
        .where(eq(contatos.id, t.contatoId));
    }
  });
}

async function dispararMensagem(card: CardInput, templateKey: string): Promise<void> {
  // Lê dados do contato para placeholder + abrir conversa.
  const [contato] = await db
    .select({ nome: contatos.nome, telefone: contatos.telefone })
    .from(contatos)
    .where(eq(contatos.id, card.contatoId))
    .limit(1);

  if (!contato?.telefone) {
    console.warn(`[cron] card ${card.id}: contato sem telefone, mensagem não enviada.`);
    return;
  }

  const conteudo = await renderTemplate(templateKey, {
    nome_cliente: contato.nome ?? 'Cliente',
  });

  await openOrCreateConversation({
    name: contato.nome ?? 'Cliente',
    phone: contato.telefone,
    content: conteudo,
  });
}
