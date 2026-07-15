import { NextResponse } from 'next/server';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db/client';
import { cards, vendedoresBling } from '@/db/schema';
import { auth } from '@/lib/auth';
import { logEvent } from '@/lib/audit';
import { addDays, toBRT } from '@/lib/time';
import { DateTime } from 'luxon';

export const maxDuration = 60;

const TZ = 'America/Sao_Paulo';
const TODAY = DateTime.fromISO('2026-07-06', { zone: TZ });
const PV_WINDOW_START = DateTime.fromISO('2026-07-07', { zone: TZ });
const PV_WINDOW_END = DateTime.fromISO('2026-07-20', { zone: TZ });
const SITUACAO_ATENDIDO = 9;

interface LastPedidoRow {
  pedido_id: number;
  contato_id: number;
  contato_nome: string;
  ref_date: string; // YYYY-MM-DD
  vendedor_id: number | null;
}

interface CardCandidate {
  contatoId: number;
  pedidoIdOrigem: number;
  nomeExibido: string;
  tipo: 'pos_venda' | 'reativacao';
  dataPrevistaAcao: Date;
  tentativasReativacao: number;
  vendedorId: number | null;
}

// POST /api/admin/seed-cards
// Sem header x-confirm → dry run (seguro, apenas conta)
// Com header x-confirm: APAGAR_TODOS → executa
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return new NextResponse('forbidden', { status: 403 });
  }

  const confirm = req.headers.get('x-confirm');
  const dryRun = confirm !== 'APAGAR_TODOS';

  // 1. Busca último pedido ATENDIDO por contato, incluindo o vendedor do Bling
  const rows = (await db.execute(drizzleSql`
    SELECT DISTINCT ON (p.contato_id)
      p.id        AS pedido_id,
      p.contato_id,
      c.nome      AS contato_nome,
      COALESCE(p.data_saida, p.data)::text AS ref_date,
      vb.id AS vendedor_id
    FROM pedidos p
    JOIN contatos c ON c.id = p.contato_id
    LEFT JOIN vendedores_bling vb
      ON (p.dados_completos_json -> 'vendedor' ->> 'id')::bigint = vb.id_bling
    WHERE p.situacao_id = ${SITUACAO_ATENDIDO}
      AND COALESCE(p.data_saida, p.data) IS NOT NULL
    ORDER BY p.contato_id, COALESCE(p.data_saida, p.data) DESC NULLS LAST
  `)) as unknown as LastPedidoRow[];

  // 2. Busca vendedores para round-robin (fallback quando pedido não tem vendedor no Bling)
  const vendedores = await db.select({ id: vendedoresBling.id }).from(vendedoresBling).orderBy(vendedoresBling.id);

  function getRoundRobinVendedorId(idx: number): number | null {
    if (vendedores.length === 0) return null;
    return vendedores[idx % vendedores.length]?.id ?? null;
  }

  // 3. Classifica cada contato
  const posVendaCandidates: CardCandidate[] = [];
  const reativacaoCandidates: CardCandidate[] = [];
  const ignorados: { contato: string; ref_date: string; motivo: string }[] = [];

  let rrIdx = 0; // round-robin index — só usado quando o pedido não tem vendedor no Bling

  for (const row of rows) {
    const refDt = toBRT(row.ref_date);
    const pvDt = addDays(refDt, 14);
    // Vendedor do pedido tem prioridade; round-robin é só fallback
    const vendedorId = row.vendedor_id ?? getRoundRobinVendedorId(rrIdx++);

    if (pvDt >= PV_WINDOW_START && pvDt <= PV_WINDOW_END) {
      // Grupo A: pós-venda dentro da janela (D+1 a D+14)
      posVendaCandidates.push({
        contatoId: Number(row.contato_id),
        pedidoIdOrigem: Number(row.pedido_id),
        nomeExibido: row.contato_nome,
        tipo: 'pos_venda',
        dataPrevistaAcao: pvDt.toJSDate(),
        tentativasReativacao: 0,
        vendedorId,
      });
    } else if (pvDt < PV_WINDOW_START) {
      // Grupo B: pós-venda já passou → calcular próxima reativação
      const baseDt = pvDt;
      const daysElapsed = TODAY.diff(baseDt, 'days').days;
      const n = Math.max(Math.ceil(daysElapsed / 90), 1);
      const nextDt = baseDt.plus({ days: n * 90 });

      reativacaoCandidates.push({
        contatoId: Number(row.contato_id),
        pedidoIdOrigem: Number(row.pedido_id),
        nomeExibido: row.contato_nome,
        tipo: 'reativacao',
        dataPrevistaAcao: nextDt.toJSDate(),
        tentativasReativacao: 0,
        vendedorId,
      });
    } else {
      // Grupo C: compra muito recente, fora da janela de 14 dias
      ignorados.push({
        contato: row.contato_nome,
        ref_date: row.ref_date,
        motivo: `pv_date=${pvDt.toISODate() ?? '?'} > janela (>${PV_WINDOW_END.toISODate() ?? '?'})`,
      });
    }
  }

  const counts = {
    contatosComPedido: rows.length,
    posVenda: posVendaCandidates.length,
    reativacao: reativacaoCandidates.length,
    ignorados: ignorados.length,
    totalCards: posVendaCandidates.length + reativacaoCandidates.length,
  };

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      message: 'Sem modificações. Envie x-confirm: APAGAR_TODOS para executar.',
      counts,
      ignorados_detalhe: ignorados,
    });
  }

  // 4. EXECUÇÃO REAL — dentro de transação
  const allCandidates = [...posVendaCandidates, ...reativacaoCandidates];

  await db.transaction(async (tx) => {
    // Preserva audit log: desvincula eventos antes de deletar cards
    await tx.execute(drizzleSql`UPDATE eventos SET card_id = NULL WHERE card_id IS NOT NULL`);

    // Deleta todos os cards (cascade: atividades, comentarios)
    await tx.execute(drizzleSql`DELETE FROM cards`);

    // Insere em lotes de 100
    const BATCH = 100;
    for (let i = 0; i < allCandidates.length; i += BATCH) {
      const batch = allCandidates.slice(i, i + BATCH);
      await tx.insert(cards).values(
        batch.map((c) => ({
          contatoId: c.contatoId,
          pedidoIdOrigem: c.pedidoIdOrigem,
          tipo: c.tipo,
          coluna: 'pendente' as const,
          nomeExibido: c.nomeExibido,
          tentativasReativacao: c.tentativasReativacao,
          dataPrevistaAcao: c.dataPrevistaAcao,
          vendedorId: c.vendedorId,
        })),
      );
    }
  });

  await logEvent({
    tipo: 'seed_cards_inicial',
    origem: 'api_interna',
    payload: {
      by: session.user.id,
      ...counts,
    },
  });

  return NextResponse.json({
    ok: true,
    dry_run: false,
    counts,
    ignorados_detalhe: ignorados,
  });
}
