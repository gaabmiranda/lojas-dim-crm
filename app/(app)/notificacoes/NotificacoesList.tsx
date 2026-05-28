'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

interface Notificacao {
  id: number;
  tipo: string;
  titulo: string;
  link: string | null;
  lida: boolean;
  criadoEm: string;
}

async function fetchAll(): Promise<{ data: Notificacao[] }> {
  const resp = await fetch('/api/notificacoes');
  if (!resp.ok) throw new Error('falha');
  return await resp.json();
}

async function marcarLida(id: number) {
  await fetch(`/api/notificacoes/${id}`, { method: 'PATCH' });
}

export function NotificacoesList() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notificacoes-all'],
    queryFn: fetchAll,
    refetchInterval: 30_000,
  });

  const mut = useMutation({
    mutationFn: marcarLida,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notificacoes-all'] });
      qc.invalidateQueries({ queryKey: ['notificacoes-unread'] });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">carregando…</p>;
  if (!data || data.data.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem notificações.</p>;
  }

  return (
    <ul className="space-y-1">
      {data.data.map((n) => (
        <li
          key={n.id}
          className={`border rounded-md p-3 flex justify-between items-start ${
            n.lida ? 'bg-card' : 'bg-accent/30'
          }`}
        >
          <div>
            <p className="text-sm font-medium">{n.titulo}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(n.criadoEm).toLocaleString('pt-BR')} · {n.tipo}
            </p>
          </div>
          <div className="flex gap-2">
            {n.link && (
              <Link href={n.link} className="text-xs text-primary hover:underline">
                abrir
              </Link>
            )}
            {!n.lida && (
              <button
                onClick={() => mut.mutate(n.id)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                marcar como lida
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
