import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';
import { Bell, KanbanSquare, Settings, Users } from 'lucide-react';
import { NotificacoesBadge } from './_components/NotificacoesBadge';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin = session.user.role === 'admin';

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-card">
        <div className="p-4 border-b">
          <Link href="/kanban" className="font-semibold text-lg">
            CRM Dim
          </Link>
        </div>
        <nav className="p-2 space-y-1">
          <NavItem href="/kanban" icon={<KanbanSquare className="h-4 w-4" />} label="Kanban" />
          <NavItem href="/contatos" icon={<Users className="h-4 w-4" />} label="Contatos" />
          <NavItem
            href="/notificacoes"
            icon={<Bell className="h-4 w-4" />}
            label="Notificações"
            right={<NotificacoesBadge />}
          />
          {isAdmin && (
            <NavItem href="/config" icon={<Settings className="h-4 w-4" />} label="Config" />
          )}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b bg-card flex items-center justify-between px-6">
          <span className="text-sm text-muted-foreground">
            {session.user.nome ?? session.user.email}
          </span>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/login' });
            }}
          >
            <button
              type="submit"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Sair
            </button>
          </form>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

function NavItem({
  href,
  icon,
  label,
  right,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent text-foreground"
    >
      {icon}
      <span className="flex-1">{label}</span>
      {right}
    </Link>
  );
}
