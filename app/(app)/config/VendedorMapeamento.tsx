'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

interface VendedorBling {
  id: number;
  idBling: number;
  contatoNome: string | null;
  usuarioId: number | null;
}

interface Usuario {
  id: number;
  nome: string | null;
}

export function VendedorMapeamento({
  vendedores,
  usuarios,
}: {
  vendedores: VendedorBling[];
  usuarios: Usuario[];
}) {
  const [mapeamento, setMapeamento] = useState<Record<number, number | null>>(() =>
    Object.fromEntries(vendedores.map((v) => [v.id, v.usuarioId])),
  );
  const [pendingSave, startSave] = useTransition();
  const [pendingBackfill, startBackfill] = useTransition();

  async function salvarVendedor(vendedorId: number, usuarioId: number | null) {
    setMapeamento((prev) => ({ ...prev, [vendedorId]: usuarioId }));
    startSave(async () => {
      const resp = await fetch(`/api/admin/vendedores-bling/${vendedorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioId }),
      });
      if (!resp.ok) {
        toast.error('Falha ao salvar mapeamento.');
      } else {
        toast.success('Mapeamento salvo.');
      }
    });
  }

  async function aplicarBackfill() {
    startBackfill(async () => {
      const resp = await fetch('/api/admin/vendedores-bling/backfill', {
        method: 'POST',
      });
      if (!resp.ok) {
        toast.error('Falha no backfill.');
        return;
      }
      const result = await resp.json() as { updated: number };
      toast.success(`Backfill concluído — ${result.updated} card(s) atualizados.`);
    });
  }

  if (vendedores.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum vendedor encontrado em vendedores_bling. Execute a importação completa primeiro
        (import-all-bling.ps1).
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground border-b">
          <tr>
            <th className="py-2 pr-4">Vendedor no Bling</th>
            <th className="py-2 pr-4">ID Bling</th>
            <th className="py-2">Usuário CRM</th>
          </tr>
        </thead>
        <tbody>
          {vendedores.map((v) => (
            <tr key={v.id} className="border-b last:border-0">
              <td className="py-2 pr-4 font-medium">{v.contatoNome ?? `#${v.idBling}`}</td>
              <td className="py-2 pr-4 text-muted-foreground">{v.idBling}</td>
              <td className="py-2">
                <select
                  value={mapeamento[v.id] ?? ''}
                  onChange={(e) =>
                    salvarVendedor(v.id, e.target.value ? Number(e.target.value) : null)
                  }
                  disabled={pendingSave}
                  className="text-sm border rounded-md px-2 py-1 bg-background min-w-[180px]"
                >
                  <option value="">— sem vínculo —</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome ?? `#${u.id}`}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-4 pt-2 border-t">
        <div>
          <p className="text-sm font-medium">Aplicar mapeamento a cards existentes</p>
          <p className="text-xs text-muted-foreground">
            Atualiza cards que ainda não têm vendedor atribuído, cruzando com o pedido de origem.
          </p>
        </div>
        <button
          onClick={aplicarBackfill}
          disabled={pendingBackfill}
          className="ml-auto text-xs bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
        >
          {pendingBackfill ? 'Aplicando…' : 'Aplicar backfill'}
        </button>
      </div>
    </div>
  );
}
