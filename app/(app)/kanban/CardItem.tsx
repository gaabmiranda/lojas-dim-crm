'use client';

import { useDraggable } from '@dnd-kit/core';
import { useRouter } from 'next/navigation';
import type { KanbanCardData } from './KanbanBoard';

function formatCurrency(valor: string | null): string {
  if (!valor) return '—';
  const n = Number(valor);
  if (Number.isNaN(n)) return valor;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface CardItemProps {
  card: KanbanCardData;
  modoSelecao?: boolean;
  selecionado?: boolean;
  onToggle?: (id: number) => void;
}

export function CardItem({ card, modoSelecao, selecionado, onToggle }: CardItemProps) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(card.id),
    disabled: modoSelecao,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const tipoLabel =
    card.tipo === 'pos_venda' ? 'Pós-venda' : `Reativação ${card.tentativasReativacao}/3`;
  const tipoColor =
    card.tipo === 'pos_venda'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';

  function handleClick() {
    if (modoSelecao) {
      onToggle?.(card.id);
    } else if (!isDragging) {
      router.push(`/cards/${card.id}`);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(modoSelecao ? {} : { ...listeners, ...attributes })}
      onClick={handleClick}
      className={`relative rounded-md border bg-card p-3 shadow-sm select-none transition-shadow ${
        modoSelecao
          ? selecionado
            ? 'ring-2 ring-primary cursor-pointer'
            : 'cursor-pointer hover:ring-1 hover:ring-muted-foreground'
          : isDragging
          ? 'opacity-50 cursor-grabbing'
          : 'cursor-pointer hover:shadow-md'
      }`}
    >
      {modoSelecao && (
        <span
          className={`absolute top-2 right-2 w-4 h-4 rounded border flex items-center justify-center text-xs
            ${selecionado ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground bg-background'}`}
        >
          {selecionado && '✓'}
        </span>
      )}
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="font-medium text-sm truncate pr-5">{card.contatoNome}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded border whitespace-nowrap ${tipoColor} ${modoSelecao ? 'invisible' : ''}`}>
          {tipoLabel}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        {formatCurrency(card.valorPedido)}
      </div>
    </div>
  );
}
