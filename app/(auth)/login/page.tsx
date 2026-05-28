import { redirect } from 'next/navigation';
import { auth, signIn } from '@/lib/auth';

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string; erro?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user) {
    redirect(params.callbackUrl || '/kanban');
  }

  async function loginAction(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '');
    const senha = String(formData.get('senha') ?? '');
    const callbackUrl = String(formData.get('callbackUrl') ?? '/kanban');
    try {
      await signIn('credentials', { email, senha, redirectTo: callbackUrl });
    } catch (err) {
      // next-auth redireciona via throw — repropaga.
      throw err;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">CRM Lojas Dim</h1>
          <p className="text-sm text-muted-foreground">Entre com suas credenciais</p>
        </div>

        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="callbackUrl" value={params.callbackUrl ?? '/kanban'} />

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="senha" className="text-sm font-medium">
              Senha
            </label>
            <input
              id="senha"
              name="senha"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          {params.erro && (
            <p className="text-sm text-destructive">Email ou senha inválidos.</p>
          )}

          <button
            type="submit"
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
