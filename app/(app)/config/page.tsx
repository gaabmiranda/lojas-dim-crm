import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { FeatureFlagsTab } from './FeatureFlagsTab';
import { UsuariosTab } from './UsuariosTab';
import { TemplatesTab } from './TemplatesTab';

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    redirect('/kanban');
  }

  const { tab = 'flags' } = await searchParams;

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Apenas admin.</p>
      </header>
      <nav className="border-b flex gap-1">
        <TabLink slug="flags" current={tab} label="Feature Flags" />
        <TabLink slug="usuarios" current={tab} label="Usuários" />
        <TabLink slug="templates" current={tab} label="Templates" />
      </nav>
      {tab === 'flags' && <FeatureFlagsTab />}
      {tab === 'usuarios' && <UsuariosTab />}
      {tab === 'templates' && <TemplatesTab />}
    </div>
  );
}

function TabLink({ slug, current, label }: { slug: string; current: string; label: string }) {
  const active = current === slug;
  return (
    <a
      href={`?tab=${slug}`}
      className={`px-4 py-2 text-sm border-b-2 -mb-px ${
        active ? 'border-primary font-medium' : 'border-transparent text-muted-foreground'
      }`}
    >
      {label}
    </a>
  );
}
