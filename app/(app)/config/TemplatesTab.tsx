'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

interface Template {
  key: string;
  descricao: string | null;
  conteudo: string;
}

async function fetchTemplates(): Promise<{ data: Template[] }> {
  const r = await fetch('/api/templates');
  if (!r.ok) throw new Error('falha');
  return await r.json();
}

async function saveTemplate(args: { key: string; conteudo: string; descricao?: string }) {
  const r = await fetch('/api/templates', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'falha');
  }
}

function previewWith(content: string): string {
  const dummy: Record<string, string> = {
    nome_cliente: 'João',
    primeiro_item: 'retalho azul 1m',
    total: '120,00',
  };
  return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => dummy[k] ?? `[${k}]`);
}

export function TemplatesTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['templates'], queryFn: fetchTemplates });
  const [edits, setEdits] = useState<Record<string, string>>({});

  const mut = useMutation({
    mutationFn: saveTemplate,
    onSuccess: () => {
      toast.success('Template salvo.');
      qc.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (err) => toast.error('Falha: ' + (err as Error).message),
  });

  return (
    <section className="space-y-4">
      {data?.data.map((t) => {
        const current = edits[t.key] ?? t.conteudo;
        const dirty = current !== t.conteudo;
        return (
          <div key={t.key} className="border rounded-lg p-4 bg-card space-y-2">
            <div className="flex justify-between items-baseline">
              <div>
                <code className="text-sm font-medium">{t.key}</code>
                {t.descricao && (
                  <p className="text-xs text-muted-foreground">{t.descricao}</p>
                )}
              </div>
              <button
                disabled={!dirty || mut.isPending}
                onClick={() => mut.mutate({ key: t.key, conteudo: current })}
                className="bg-primary text-primary-foreground rounded-md px-3 py-1 text-sm disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
            <textarea
              value={current}
              onChange={(e) => setEdits((p) => ({ ...p, [t.key]: e.target.value }))}
              rows={5}
              className="w-full border rounded-md px-3 py-2 text-sm font-mono"
            />
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Preview</summary>
              <pre className="mt-2 p-2 bg-muted rounded whitespace-pre-wrap">
                {previewWith(current)}
              </pre>
            </details>
          </div>
        );
      })}
    </section>
  );
}
