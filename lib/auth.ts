import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { usuarios, type RoleUsuario } from '@/db/schema';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: RoleUsuario;
      nome?: string | null;
    } & DefaultSession['user'];
  }

  interface User {
    role: RoleUsuario;
    nome?: string | null;
  }
}

interface AppJwtClaims {
  userId?: number;
  role?: RoleUsuario;
  nome?: string | null;
}

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  trustHost: true,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        senha: { label: 'Senha', type: 'password' },
      },
      authorize: async (raw) => {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const [user] = await db
          .select()
          .from(usuarios)
          .where(eq(usuarios.email, parsed.data.email))
          .limit(1);

        if (!user || !user.ativo) return null;

        const ok = await bcrypt.compare(parsed.data.senha, user.senhaHash);
        if (!ok) return null;

        return {
          id: String(user.id),
          email: user.email,
          name: user.nome ?? user.email,
          nome: user.nome,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const t = token as AppJwtClaims & typeof token;
        t.userId = Number(user.id);
        t.role = user.role;
        t.nome = user.nome ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as AppJwtClaims;
      if (t.userId != null) {
        session.user.id = String(t.userId);
      }
      if (t.role) {
        session.user.role = t.role;
      }
      if (t.nome != null) {
        session.user.nome = t.nome;
      }
      return session;
    },
  },
});

// Helper: garante que o usuário logado é admin. Use em routes protegidas.
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    throw new Response('Forbidden', { status: 403 });
  }
  return session;
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return session;
}
