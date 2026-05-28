import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { roleUsuarioEnum, usuarios } from '@/db/schema';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user) return new NextResponse('unauthorized', { status: 401 });

  // Vendedores podem ver lista; admin vê tudo. (Senhas nunca expostas.)
  const rows = await db
    .select({
      id: usuarios.id,
      email: usuarios.email,
      nome: usuarios.nome,
      role: usuarios.role,
      ativo: usuarios.ativo,
      telefone: usuarios.telefone,
    })
    .from(usuarios)
    .orderBy(asc(usuarios.nome));

  return NextResponse.json({ data: rows });
}

const createSchema = z.object({
  email: z.string().email(),
  nome: z.string().min(1),
  senha: z.string().min(6),
  role: z.enum(roleUsuarioEnum.enumValues).default('vendedor'),
  telefone: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return new NextResponse('forbidden', { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const senhaHash = await bcrypt.hash(parsed.data.senha, 10);

  const inserted = await db
    .insert(usuarios)
    .values({
      email: parsed.data.email,
      nome: parsed.data.nome,
      senhaHash,
      role: parsed.data.role,
      telefone: parsed.data.telefone,
      ativo: true,
    })
    .returning({
      id: usuarios.id,
      email: usuarios.email,
      nome: usuarios.nome,
      role: usuarios.role,
    });

  return NextResponse.json(inserted[0], { status: 201 });
}
