import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/client';
import { featureFlags } from '@/db/schema';
import { auth } from '@/lib/auth';
import { setFlag } from '@/lib/feature-flags';

export async function GET() {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  const rows = await db.select().from(featureFlags);
  return NextResponse.json({ data: rows });
}

const schema = z.object({ key: z.string().min(1), value: z.string() });

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

  await setFlag(parsed.data.key, parsed.data.value);
  return NextResponse.json({ ok: true });
}
