import { NotificacoesList } from './NotificacoesList';

export default function NotificacoesPage() {
  return (
    <div className="p-6 max-w-3xl">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Notificações</h1>
        <p className="text-sm text-muted-foreground">Polling 30s. Clique em uma notificação para marcar como lida.</p>
      </header>
      <NotificacoesList />
    </div>
  );
}
