'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

interface Usuario {
  id: number;
  email: string;
  nome: string | null;
  role: 'admin' | 'vendedor';
  ativo: boolean;
  telefone: string | null;
}

async function fetchUsuarios(): Promise<{ data: Usuario[] }> {
  const r = await fetch('/api/usuarios');
  if (!r.ok) throw new Error('falha');
  return await r.json();
}

interface NovoUsuario {
  email: string;
  nome: string;
  senha: string;
  role: 'admin' | 'vendedor';
  telefone?: string;
}

async function createUsuario(args: NovoUsuario) {
  const r = await fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error('falha');
}

export function UsuariosTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['usuarios'], queryFn: fetchUsuarios });
  const [form, setForm] = useState<NovoUsuario>({
    email: '',
    nome: '',
    senha: '',
    role: 'vendedor',
  });

  const mut = useMutation({
    mutationFn: createUsuario,
    onSuccess: () => {
      toast.success('Usuário criado.');
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      setForm({ email: '', nome: '', senha: '', role: 'vendedor' });
    },
    onError: () => toast.error('Falha ao criar usuário.'),
  });

  return (
    <section className="space-y-6">
      <div className="border rounded-lg bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Nome</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">Telefone</th>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-3 py-2">{u.nome ?? '—'}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.role}</td>
                <td className="px-3 py-2">{u.telefone ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate(form);
        }}
        className="border rounded-lg p-4 bg-card space-y-3"
      >
        <h3 className="font-medium">Novo usuário</h3>
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Nome"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            className="border rounded-md px-3 py-2 text-sm"
            required
          />
          <input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="border rounded-md px-3 py-2 text-sm"
            required
          />
          <input
            placeholder="Senha (≥6)"
            type="password"
            value={form.senha}
            onChange={(e) => setForm({ ...form, senha: e.target.value })}
            className="border rounded-md px-3 py-2 text-sm"
            minLength={6}
            required
          />
          <input
            placeholder="Telefone (opcional)"
            value={form.telefone ?? ''}
            onChange={(e) => setForm({ ...form, telefone: e.target.value || undefined })}
            className="border rounded-md px-3 py-2 text-sm"
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'vendedor' })}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="vendedor">vendedor</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={mut.isPending}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm disabled:opacity-50"
        >
          {mut.isPending ? 'Criando…' : 'Criar'}
        </button>
      </form>
    </section>
  );
}
