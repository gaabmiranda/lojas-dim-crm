'use client';

import { useQuery } from '@tanstack/react-query';

interface UnreadResponse {
  count: number;
}

async function fetchUnread(): Promise<UnreadResponse> {
  const resp = await fetch('/api/notificacoes?lida=false&onlyCount=true');
  if (!resp.ok) return { count: 0 };
  return (await resp.json()) as UnreadResponse;
}

export function NotificacoesBadge() {
  const { data } = useQuery({
    queryKey: ['notificacoes-unread'],
    queryFn: fetchUnread,
    refetchInterval: 30_000,
  });
  const count = data?.count ?? 0;
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 text-xs font-medium rounded-full bg-destructive text-destructive-foreground">
      {count > 99 ? '99+' : count}
    </span>
  );
}
