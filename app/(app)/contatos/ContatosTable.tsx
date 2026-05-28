'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useState } from 'react';

interface Contato {
  id: number;
  nome: string;
  telefone: string | null;
  email: string | null;
  situacaoBling: string | null;
}

interface Response {
  data: Contato[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 50;

async function fetchContatos(q: string, page: number): Promise<Response> {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
  });
  if (q.trim()) params.set('q', q.trim());
  const resp = await fetch(`/api/contatos?${params}`);
  if (!resp.ok) throw new Error('falha');
  return (await resp.json()) as Response;
}

export function ContatosTable() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['contatos', q, page],
    queryFn: () => fetchContatos(q, page),
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder="Buscar por nome ou telefone…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(0);
        }}
        className="border rounded-md px-3 py-2 text-sm w-full max-w-sm"
      />

      <div className="border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Nome</th>
              <th className="text-left px-3 py-2">Telefone</th>
              <th className="text-left px-3 py-2">Email</th>
              <th className="text-left px-3 py-2">Sit.</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-muted-foreground">
                  carregando…
                </td>
              </tr>
            )}
            {data?.data.map((c) => (
              <tr key={c.id} className="border-t hover:bg-muted/20">
                <td className="px-3 py-2 font-medium">{c.nome}</td>
                <td className="px-3 py-2">{c.telefone ?? '—'}</td>
                <td className="px-3 py-2">{c.email ?? '—'}</td>
                <td className="px-3 py-2">{c.situacaoBling ?? '—'}</td>
              </tr>
            ))}
            {data && data.data.length === 0 && !isLoading && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-muted-foreground">
                  Nenhum resultado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {total.toLocaleString('pt-BR')} contatos · página {page + 1} de {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="border rounded-md px-3 py-1 text-sm disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= totalPages}
            className="border rounded-md px-3 py-1 text-sm disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
