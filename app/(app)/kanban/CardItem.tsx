'use client';

import { useDraggable } from '@dnd-kit/core';
import Link from 'next/link';
import type { KanbanCardData } from './KanbanBoard';

function formatCurrency(valor: string | null): string {
  if (!valor) return '—';
  const n = Number(valor);
  if (Number.isNaN(n)) return valor;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

function tempoNaEtapa(iso: string): { label: string; colorClass: string } {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias === 0) return { label: 'hoje', colorClass: 'text-muted-foreground' };
  if (dias === 1) return { label: '1 dia', colorClass: 'text-muted-foreground' };
  if (dias < 7) return { label: `${dias} dias`, colorClass: 'text-yellow-600' };
  if (dias < 14) return { label: `${dias} dias`, colorClass: 'text-orange-600 font-medium' };
  return { label: `${dias} dias`, colorClass: 'text-red-600 font-semibold' };
}

export function CardItem({ card }: { card: KanbanCardData }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(card.id),
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

  const tempo = tempoNaEtapa(card.colunaDeSde);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-md border bg-card p-3 shadow-sm cursor-grab ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <Link
          href={`/cards/${card.id}`}
          className="font-medium text-sm hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {card.contatoNome}
        </Link>
        <span className={`text-xs px-1.5 py-0.5 rounded border whitespace-nowrap ${tipoColor}`}>
          {tipoLabel}
        </span>
      </div>
      <div className="text-xs text-muted-foreground flex justify-between">
        <span>{formatCurrency(card.valorPedido)}</span>
        <span>{formatDate(card.dataPrevistaAcao)}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <span className={`text-xs ${tempo.colorClass}`}>{tempo.label}</span>
        <span className="text-xs text-muted-foreground">nesta etapa</span>
      </div>
    </div>
  );
}
