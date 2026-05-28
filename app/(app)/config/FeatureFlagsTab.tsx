'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Flag {
  key: string;
  value: string;
}

async function fetchFlags(): Promise<{ data: Flag[] }> {
  const r = await fetch('/api/feature-flags');
  if (!r.ok) throw new Error('falha');
  return await r.json();
}

async function updateFlag(args: { key: string; value: string }) {
  const r = await fetch('/api/feature-flags', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error('falha');
}

export function FeatureFlagsTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['flags'], queryFn: fetchFlags });
  const mut = useMutation({
    mutationFn: updateFlag,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flags'] });
      toast.success('Flag atualizada.');
    },
    onError: () => toast.error('Falha ao atualizar.'),
  });

  return (
    <section className="space-y-2">
      {data?.data.map((f) => {
        const isBool = f.value === 'true' || f.value === 'false';
        return (
          <div
            key={f.key}
            className="flex items-center justify-between border rounded-md p-3 bg-card"
          >
            <code className="text-sm">{f.key}</code>
            {isBool ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={f.value === 'true'}
                  onChange={(e) =>
                    mut.mutate({ key: f.key, value: e.target.checked ? 'true' : 'false' })
                  }
                />
                <span className="text-sm">{f.value === 'true' ? 'ON' : 'OFF'}</span>
              </label>
            ) : (
              <input
                defaultValue={f.value}
                onBlur={(e) => {
                  if (e.target.value !== f.value) {
                    mut.mutate({ key: f.key, value: e.target.value });
                  }
                }}
                className="border rounded-md px-2 py-1 text-xs w-64"
              />
            )}
          </div>
        );
      })}
    </section>
  );
}
