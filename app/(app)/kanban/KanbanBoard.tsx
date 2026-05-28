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
}

export interface KanbanColuna {
  id: ColunaCard;
  titulo: string;
  items: KanbanCardData[];
}

export function KanbanBoard({ colunas: initialColunas }: { colunas: KanbanColuna[] }) {
  const [colunas, setColunas] = useState(initialColunas);
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const cardsById = useMemo(() => {
    const map = new Map<number, KanbanCardData>();
    for (const c of colunas) for (const card of c.items) map.set(card.id, card);
    return map;
  }, [colunas]);

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

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {colunas.map((col) => (
          <Coluna key={col.id} coluna={col} />
        ))}
      </div>
    </DndContext>
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
