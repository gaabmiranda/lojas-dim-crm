import { NextResponse } from 'next/server';
import { sql as drizzleSql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { templatesMensagem } from '@/db/schema';
import { auth } from '@/lib/auth';
import { extrairPlaceholders } from '@/lib/templates';

export async function GET() {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  const rows = await db.select().from(templatesMensagem);
  return NextResponse.json({ data: rows });
}

const schema = z.object({
  key: z.string().min(1),
  conteudo: z.string().min(1).max(5000),
  descricao: z.string().optional(),
});

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return new NextResponse('forbidden', { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Templates de pós-venda/reativação devem ter {{nome_cliente}}.
  const placeholders = extrairPlaceholders(parsed.data.conteudo);
  const requiresNomeCliente = ['pos_venda_d14', 'reativacao_1', 'reativacao_2', 'reativacao_3'];
  if (requiresNomeCliente.includes(parsed.data.key) && !placeholders.includes('nome_cliente')) {
    return NextResponse.json(
      { error: `Template '${parsed.data.key}' deve conter {{nome_cliente}}.` },
      { status: 400 },
    );
  }

  await db
    .insert(templatesMensagem)
    .values({
      key: parsed.data.key,
      conteudo: parsed.data.conteudo,
      descricao: parsed.data.descricao,
    })
    .onConflictDoUpdate({
      target: templatesMensagem.key,
      set: {
        conteudo: parsed.data.conteudo,
        descricao: parsed.data.descricao,
        atualizadoEm: drizzleSql`now()`,
      },
    });

  return NextResponse.json({ ok: true });
}
