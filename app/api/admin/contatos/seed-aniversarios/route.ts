import { NextResponse } from 'next/server';
import { isNull, sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db/client';
import { contatos } from '@/db/schema';
import { auth } from '@/lib/auth';
import { logEvent } from '@/lib/audit';
import { parseDate } from '@/lib/bling/mapper';
import { upsertBirthdayCard } from '@/lib/birthday';

// Fase 1: extrai data_nascimento do dados_extras_json para data_aniversario.
// Fase 2: cria card de aniversário para contatos sem card ativo/pausado de aniversário.
// Chame repetidamente até { fase1: 0, fase2: 0 } para completar o backfill.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  const limite = typeof body.limite === 'number' ? Math.min(body.limite, 200) : 50;

  // ── Fase 1: preenche data_aniversario a partir do JSON já armazenado ───────
  const semAniversario = await db.execute<{
    id: number;
    dados_extras_json: Record<string, unknown> | null;
  }>(drizzleSql`
    SELECT id, dados_extras_json
    FROM contatos
    WHERE data_aniversario IS NULL
      AND dados_extras_json IS NOT NULL
      AND dados_extras_json->>'dataNascimento' IS NOT NULL
    LIMIT ${limite}
  `);

  let fase1 = 0;
  for (const c of semAniversario) {
    const dataNascStr = c.dados_extras_json?.dataNascimento as string | undefined;
    if (!dataNascStr) continue;
    const parsed = parseDate(dataNascStr);
    if (!parsed) continue;
    await db.execute(drizzleSql`
      UPDATE contatos SET data_aniversario = ${parsed}, atualizado_em = now() WHERE id = ${c.id}
    `);
    fase1++;
  }

  // ── Fase 2: cria cards de aniversário para contatos que ainda não têm ──────
  const comAniversario = await db.execute<{
    id: number;
    nome: string;
    data_aniversario: Date;
    vendedor_id: number | null;
  }>(drizzleSql`
    SELECT c.id, c.nome, c.data_aniversario,
      (SELECT ca.vendedor_id FROM cards ca
       WHERE ca.contato_id = c.id AND ca.coluna != 'arquivo'
       ORDER BY ca.criado_em DESC LIMIT 1) AS vendedor_id
    FROM contatos c
    WHERE c.data_aniversario IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM cards ca
        WHERE ca.contato_id = c.id AND ca.tipo = 'aniversario' AND ca.coluna != 'arquivo'
      )
    LIMIT ${limite}
  `);

  let fase2 = 0;
  let erros = 0;
  for (const c of comAniversario) {
    if (!c.data_aniversario) continue;
    try {
      await upsertBirthdayCard(c.id, c.data_aniversario, c.nome, c.vendedor_id);
      fase2++;
    } catch (err) {
      erros++;
      console.error(`[seed-aniversarios] contato ${c.id}:`, err);
    }
  }

  await logEvent({
    tipo: 'seed_aniversarios',
    origem: 'api_interna',
    payload: { fase1, fase2, erros },
  });

  return NextResponse.json({
    ok: true,
    fase1,
    fase2,
    erros,
    encerrado: semAniversario.length === 0 && comAniversario.length === 0,
  });
}
