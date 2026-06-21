import { NextResponse } from 'next/server';
import { isNull, sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db/client';
import { contatos } from '@/db/schema';
import { auth } from '@/lib/auth';
import { logEvent } from '@/lib/audit';
import { getContato } from '@/lib/bling/client';
import { extrairTelefone } from '@/lib/bling/mapper';

// Processa N contatos sem telefone por chamada (padrão 50).
// Chame repetidamente até total=0 para completar o backfill.
// Respeita o throttle do client Bling (2 req/s).
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  const limite = typeof body.limite === 'number' ? Math.min(body.limite, 200) : 50;

  // Conta total pendente antes do batch para retornar progresso.
  const [countRow] = await db
    .select({ total: drizzleSql<number>`count(*)::int` })
    .from(contatos)
    .where(isNull(contatos.telefone));
  const total = countRow?.total ?? 0;

  const pendentes = await db
    .select({ id: contatos.id, idBling: contatos.idBling })
    .from(contatos)
    .where(isNull(contatos.telefone))
    .limit(limite);

  let atualizados = 0;
  let semTelefoneNoBling = 0;
  let erros = 0;

  for (const c of pendentes) {
    try {
      const fullContato = await getContato(c.idBling);
      const telefone = extrairTelefone(fullContato);
      if (!telefone) {
        semTelefoneNoBling++;
        // Marca dados_extras_json para não re-tentar infinitamente.
        await db.execute(drizzleSql`
          UPDATE contatos
          SET dados_extras_json = COALESCE(dados_extras_json, '{}') || '{"_sem_telefone": true}'::jsonb,
              atualizado_em = now()
          WHERE id = ${c.id} AND telefone IS NULL
        `);
        continue;
      }
      await db.execute(drizzleSql`
        UPDATE contatos
        SET telefone = ${telefone},
            dados_extras_json = ${JSON.stringify(fullContato)}::jsonb,
            atualizado_em = now()
        WHERE id = ${c.id} AND telefone IS NULL
      `);
      atualizados++;
    } catch (err) {
      erros++;
      console.error(`[backfill-telefone] contato ${c.id} (bling ${c.idBling}):`, err);
    }
  }

  await logEvent({
    tipo: 'backfill_telefone',
    origem: 'api_interna',
    payload: { lote: pendentes.length, atualizados, semTelefoneNoBling, erros, totalPendentes: total },
  });

  return NextResponse.json({
    ok: true,
    totalPendentes: total,
    lote: pendentes.length,
    atualizados,
    semTelefoneNoBling,
    erros,
    encerrado: pendentes.length === 0,
  });
}
