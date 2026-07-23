'use client';

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useMemo, useState, useTransition } from 'react';
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

const COLUNA_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  em_contato: 'Em Contato',
};

export function KanbanBoard({
  colunas: initialColunas,
  vendedores,
  filtros,
  arquivadoCards,
}: {
  colunas: KanbanColuna[];
  vendedores: Vendedor[];
  filtros: Filtros;
  arquivadoCards?: KanbanCardData[];
}) {
  const [colunas, setColunas] = useState(initialColunas);
  const [localFiltros, setLocalFiltros] = useState<Filtros>(filtros);
  const [busca, setBusca] = useState('');

  // Modo seleção em massa
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [bulkColuna, setBulkColuna] = useState('');
  const [bulkVendedor, setBulkVendedor] = useState('');
  const [pendingBulk, startBulkTransition] = useTransition();

  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const cardsById = useMemo(() => {
    const map = new Map<number, KanbanCardData>();
    for (const c of colunas) for (const card of c.items) map.set(card.id, card);
    return map;
  }, [colunas]);

  function filtrarItems(items: KanbanCardData[]) {
    if (!busca.trim()) return items;
    const q = busca.toLowerCase();
    return items.filter(
      (c) =>
        c.contatoNome.toLowerCase().includes(q) ||
        c.nomeExibido.toLowerCase().includes(q),
    );
  }

  function buildParams(overrides: Partial<Filtros & { arquivados: boolean }> = {}) {
    const v = overrides.vendedorId !== undefined ? overrides.vendedorId : localFiltros.vendedorId;
    const t = overrides.tipo !== undefined ? overrides.tipo : localFiltros.tipo;
    const arq = overrides.arquivados !== undefined ? overrides.arquivados : arquivadoCards !== undefined;
    const params = new URLSearchParams();
    if (v) params.set('vendedor_id', String(v));
    if (t) params.set('tipo', t);
    if (arq) params.set('arquivados', '1');
    return params.toString();
  }

  function aplicarFiltro(novo: Partial<Filtros>) {
    const next: Filtros = { ...localFiltros, ...novo };
    setLocalFiltros(next);
    const params = new URLSearchParams();
    if (next.vendedorId) params.set('vendedor_id', String(next.vendedorId));
    if (next.tipo) params.set('tipo', next.tipo);
    if (arquivadoCards !== undefined) params.set('arquivados', '1');
    router.replace(`/kanban?${params.toString()}`);
  }

  function toggleArquivados() {
    const novoArq = arquivadoCards === undefined;
    router.replace(`/kanban?${buildParams({ arquivados: novoArq })}`);
  }

  function toggleCard(id: number) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function entrarSelecao() {
    setModoSelecao(true);
    setSelecionados(new Set());
    setBulkColuna('');
    setBulkVendedor('');
  }

  function sairSelecao() {
    setModoSelecao(false);
    setSelecionados(new Set());
    setBulkColuna('');
    setBulkVendedor('');
  }

  function selecionarTodos() {
    const todos = new Set<number>();
    for (const col of colunas) for (const card of col.items) todos.add(card.id);
    setSelecionados(todos);
  }

  async function aplicarBulk() {
    if (!bulkColuna && !bulkVendedor) {
      toast.error('Selecione uma etapa ou vendedor para aplicar.');
      return;
    }
    const body: Record<string, unknown> = { ids: Array.from(selecionados) };
    if (bulkColuna) body.coluna = bulkColuna;
    if (bulkVendedor) body.vendedorId = bulkVendedor === 'null' ? null : Number(bulkVendedor);

    startBulkTransition(async () => {
      const resp = await fetch('/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        toast.error('Falha na edição em massa.');
        return;
      }
      const result = await resp.json() as { updated: number };
      toast.success(`${result.updated} card(s) atualizados.`);
      sairSelecao();
      router.refresh();
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    const cardId = Number(e.active.id);
    const dest = e.over?.id ? String(e.over.id) : null;
    if (!dest) return;
    const novaColuna = dest as ColunaCard;
    const card = cardsById.get(cardId);
    if (!card || card.coluna === novaColuna) return;

    setColunas((prev) => {
      const next = prev.map((c) => ({ ...c, items: [...c.items] }));
      for (const col of next) col.items = col.items.filter((i) => i.id !== cardId);
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
      toast.success(`Movido para ${novaColuna}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error('Falha ao mover card. Recarregue a página.');
      setColunas(initialColunas);
    }
  }

  const filtroAtivo = localFiltros.vendedorId !== null || localFiltros.tipo !== null;
  const totalCards = colunas.reduce((a, c) => a + c.items.length, 0);
  const arquivadosFiltrados = arquivadoCards ? filtrarItems(arquivadoCards) : undefined;

  return (
    <div>
      {/* Barra de busca */}
      <div className="mb-3">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente ou card…"
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {busca.trim() && (
          <p className="text-xs text-muted-foreground mt-1 px-1">
            {colunas.reduce((a, c) => a + filtrarItems(c.items).length, 0) +
              (arquivadosFiltrados?.length ?? 0)}{' '}
            resultado(s)
          </p>
        )}
      </div>

      {/* Barra de filtros + controles */}
      <div className="flex flex-wrap items-center gap-4 mb-4 p-3 rounded-lg bg-muted/30 border">
        {!modoSelecao ? (
          <>
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
                {([null, 'pos_venda', 'reativacao', 'aniversario'] as const).map((t) => (
                  <button
                    key={t ?? 'todos'}
                    onClick={() => aplicarFiltro({ tipo: t })}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      localFiltros.tipo === t
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-background text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {t === null
                      ? 'Todos'
                      : t === 'pos_venda'
                      ? 'Pós-venda'
                      : t === 'reativacao'
                      ? 'Reativação'
                      : 'Aniversário'}
                  </button>
                ))}
              </div>
            </div>

            {filtroAtivo && (
              <button
                onClick={() => aplicarFiltro({ vendedorId: null, tipo: null })}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Limpar filtros
              </button>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={toggleArquivados}
                className={`text-xs border px-3 py-1.5 rounded-md transition-colors ${
                  arquivadoCards !== undefined
                    ? 'bg-foreground text-background border-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                {arquivadoCards !== undefined ? 'Ocultar arquivados' : 'Ver arquivados'}
              </button>
              <button
                onClick={entrarSelecao}
                className="text-xs border px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
              >
                Selecionar em massa
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="text-sm font-medium">
              {selecionados.size} de {totalCards} selecionados
            </span>
            <button
              onClick={selecionarTodos}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Selecionar todos
            </button>
            <button
              onClick={() => setSelecionados(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Desmarcar
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <select
                value={bulkColuna}
                onChange={(e) => setBulkColuna(e.target.value)}
                className="text-sm border rounded-md px-2 py-1 bg-background"
              >
                <option value="">Mover para etapa…</option>
                {Object.entries(COLUNA_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <select
                value={bulkVendedor}
                onChange={(e) => setBulkVendedor(e.target.value)}
                className="text-sm border rounded-md px-2 py-1 bg-background"
              >
                <option value="">Atribuir vendedor…</option>
                <option value="null">Sem vendedor</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>{v.nome ?? `#${v.id}`}</option>
                ))}
              </select>
              <button
                onClick={aplicarBulk}
                disabled={pendingBulk || selecionados.size === 0}
                className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {pendingBulk ? 'Aplicando…' : 'Aplicar'}
              </button>
              <button
                onClick={sairSelecao}
                className="text-xs border px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>

      {/* Colunas Kanban */}
      <DndContext
        sensors={modoSelecao ? [] : sensors}
        collisionDetection={closestCorners}
        onDragEnd={onDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {colunas.map((col) => (
            <Coluna
              key={col.id}
              coluna={{ ...col, items: filtrarItems(col.items) }}
              modoSelecao={modoSelecao}
              selecionados={selecionados}
              onToggle={toggleCard}
            />
          ))}
        </div>
      </DndContext>

      {/* Seção arquivados */}
      {arquivadoCards !== undefined && (
        <div className="mt-6 border-t pt-6">
          <h2 className="font-medium text-sm text-muted-foreground mb-3">
            Arquivados —{' '}
            {arquivadosFiltrados!.length}
            {arquivadoCards.length > arquivadosFiltrados!.length &&
              ` de ${arquivadoCards.length}`}
          </h2>
          {arquivadosFiltrados!.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">
              {busca.trim() ? 'Nenhum arquivado corresponde à busca.' : 'Nenhum card arquivado.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {arquivadosFiltrados!.map((card) => (
                <CardItem key={card.id} card={card} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Coluna({
  coluna,
  modoSelecao,
  selecionados,
  onToggle,
}: {
  coluna: KanbanColuna;
  modoSelecao: boolean;
  selecionados: Set<number>;
  onToggle: (id: number) => void;
}) {
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
          <CardItem
            key={card.id}
            card={card}
            modoSelecao={modoSelecao}
            selecionado={selecionados.has(card.id)}
            onToggle={onToggle}
          />
        ))}
        {coluna.items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">vazio</p>
        )}
      </div>
    </section>
  );
}
