'use client';

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ColunaCard, TipoCard } from '@/db/schema';
import { CardItem } from './CardItem';

export interface KanbanCardData {
  id: number;
  contatoNome: string;
  nomeExibido: string;
  tipo: TipoCard;
  coluna: ColunaCard;
  valorPedido: string | null;
  dataPrevistaAcao: string | null;
  tentativasReativacao: number;
  colunaDeSde: string;
  vendedorId: number | null;
  vendedorNome: string | null;
}

export interface KanbanColuna {
  id: ColunaCard;
  titulo: string;
  items: KanbanCardData[];
}

interface Filtros {
  vendedorId: number | null;
  tipo: TipoCard | null;
}

interface Vendedor {
  id: number;
  nome: string | null;
}

export function KanbanBoard({
  colunas: initialColunas,
  vendedores,
  filtros,
}: {
  colunas: KanbanColuna[];
  vendedores: Vendedor[];
  filtros: Filtros;
}) {
  const [colunas, setColunas] = useState(initialColunas);
  const [localFiltros, setLocalFiltros] = useState<Filtros>(filtros);
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const cardsById = useMemo(() => {
    const map = new Map<number, KanbanCardData>();
    for (const c of colunas) for (const card of c.items) map.set(card.id, card);
    return map;
  }, [colunas]);

  function aplicarFiltro(novo: Partial<Filtros>) {
    const next: Filtros = { ...localFiltros, ...novo };
    setLocalFiltros(next);
    const params = new URLSearchParams();
    if (next.vendedorId) params.set('vendedor_id', String(next.vendedorId));
    if (next.tipo) params.set('tipo', next.tipo);
    router.replace(`/kanban?${params.toString()}`);
  }

  async function onDragEnd(e: DragEndEvent) {
    const cardId = Number(e.active.id);
    const dest = e.over?.id ? String(e.over.id) : null;
    if (!dest) return;
    const novaColuna = dest as ColunaCard;
    const card = cardsById.get(cardId);
    if (!card || card.coluna === novaColuna) return;

    // optimistic update
    setColunas((prev) => {
      const next = prev.map((c) => ({ ...c, items: [...c.items] }));
      for (const col of next) {
        col.items = col.items.filter((i) => i.id !== cardId);
      }
      const target = next.find((c) => c.id === novaColuna);
      if (target) target.items.unshift({ ...card, coluna: novaColuna });
      return next;
    });

    try {
      const resp = await fetch(`/api/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coluna: novaColuna }),
      });
      if (!resp.ok) throw new Error('PATCH falhou');
      toast.success(`Movido pra ${novaColuna}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error('Falha ao mover card. Recarregue a página.');
      setColunas(initialColunas);
    }
  }

  const filtroAtivo = localFiltros.vendedorId !== null || localFiltros.tipo !== null;

  return (
    <div>
      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-4 mb-4 p-3 rounded-lg bg-muted/30 border">
        <div className="flex items-center gap-2">
          <label htmlFor="filtro-vendedor" className="text-sm font-medium whitespace-nowrap">
            Vendedor
          </label>
          <select
            id="filtro-vendedor"
            value={localFiltros.vendedorId ?? ''}
            onChange={(e) =>
              aplicarFiltro({ vendedorId: e.target.value ? Number(e.target.value) : null })
            }
            className="text-sm border rounded-md px-2 py-1 bg-background min-w-[140px]"
          >
            <option value="">Todos</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome ?? `#${v.id}`}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Tipo</span>
          <div className="flex gap-1">
            {([null, 'pos_venda', 'reativacao'] as const).map((t) => (
              <button
                key={t ?? 'todos'}
                onClick={() => aplicarFiltro({ tipo: t })}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  localFiltros.tipo === t
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-foreground border-border hover:bg-muted'
                }`}
              >
                {t === null ? 'Todos' : t === 'pos_venda' ? 'Pós-venda' : 'Reativação'}
              </button>
            ))}
          </div>
        </div>

        {filtroAtivo && (
          <button
            onClick={() => aplicarFiltro({ vendedorId: null, tipo: null })}
            className="text-xs text-muted-foreground hover:text-foreground underline ml-auto"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Colunas Kanban */}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {colunas.map((col) => (
            <Coluna key={col.id} coluna={col} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Coluna({ coluna }: { coluna: KanbanColuna }) {
  return (
    <section
      id={coluna.id}
      data-droppable-id={coluna.id}
      className="rounded-lg bg-muted/40 p-3 min-h-96"
    >
      <header className="flex items-center justify-between mb-3">
        <h2 className="font-medium text-sm">{coluna.titulo}</h2>
        <span className="text-xs text-muted-foreground">{coluna.items.length}</span>
      </header>
      <div className="space-y-2">
        {coluna.items.map((card) => (
          <CardItem key={card.id} card={card} />
        ))}
        {coluna.items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">vazio</p>
        )}
      </div>
    </section>
  );
}
