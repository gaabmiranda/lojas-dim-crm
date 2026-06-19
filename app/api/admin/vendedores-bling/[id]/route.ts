import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { vendedoresBling } from '@/db/schema';
import { auth } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  usuarioId: z.number().int().nullable(),
});

export async function PATCH(req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return new NextResponse('forbidden', { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await db
    .update(vendedoresBling)
    .set({ usuarioId: parsed.data.usuarioId })
    .where(eq(vendedoresBling.id, Number(id)));

  return NextResponse.json({ ok: true });
}
