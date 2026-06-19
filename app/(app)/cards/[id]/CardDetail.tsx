'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

// --- Interfaces ---

interface Contato {
  id: number;
  nome: string;
  telefone?: string | null;
  email?: string | null;
}

interface PedidoItem {
  id: number;
  descricao: string;
  quantidade: string | null;
  valorUnitario: string | null;
  valorTotal: string | null;
}

interface PedidoOrigem {
  id: number;
  numero: string | null;
  data: Date | null;
  total: string | null;
  situacaoValor: number | null;
  itens: PedidoItem[];
}

interface PedidoHistorico {
  id: number;
  numero: string | null;
  data: Date | null;
  total: string | null;
  situacaoValor: number | null;
  itens: PedidoItem[];
}

interface Atividade {
  id: number;
  titulo: string;
  status: string;
  dataAgendada: Date;
}

interface Comentario {
  id: number;
  texto: string;
  criadoEm: Date;
  usuario: { nome: string | null; email: string };
}

interface CardData {
  id: number;
  nomeExibido: string;
  tipo: string;
  coluna: string;
  dataPrevistaAcao: Date | null;
  colunaDeSde: Date;
  tentativasReativacao: number;
  contato: Contato;
  pedidoOrigem: PedidoOrigem | null;
  atividades: Atividade[];
  comentarios: Comentario[];
}

// --- Helpers ---

function formatCurrency(v: string | number | null | undefined) {
  if (v == null) return '—';
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isNaN(n) ? String(v) : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(d: Date | string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

// --- Stats computation ---

interface Stats {
  numPedidos: number;
  ltv: number;
  ticketMedio: number;
  diasSemComprar: number | null;
}

function calcStats(pedidoOrigem: PedidoOrigem | null, historico: PedidoHistorico[]): Stats {
  const all = [...historico, ...(pedidoOrigem ? [pedidoOrigem] : [])];
  const numPedidos = all.length;
  const ltv = all.reduce((s, p) => s + Number(p.total ?? 0), 0);
  const ticketMedio = numPedidos > 0 ? ltv / numPedidos : 0;
  const datas = all.map(p => (p.data ? new Date(p.data).getTime() : 0)).filter(Boolean);
  const ultima = datas.length > 0 ? Math.max(...datas) : null;
  const diasSemComprar = ultima != null ? Math.floor((Date.now() - ultima) / 86_400_000) : null;
  return { numPedidos, ltv, ticketMedio, diasSemComprar };
}

function calcProdutoFavorito(pedidoOrigem: PedidoOrigem | null, historico: PedidoHistorico[]): string | null {
  const freq: Record<string, number> = {};
  const itens = [...(pedidoOrigem?.itens ?? []), ...historico.flatMap(p => p.itens)];
  for (const item of itens) {
    if (!item.descricao) continue;
    const key = item.descricao.split(' ').slice(0, 3).join(' ');
    freq[key] = (freq[key] ?? 0) + 1;
  }
  const top = Object.entries(freq).sort(([, a], [, b]) => b - a)[0];
  return top ? top[0] : null;
}

// --- Root component ---

export function CardDetail({ card, historico }: { card: CardData; historico: PedidoHistorico[] }) {
  const stats = calcStats(card.pedidoOrigem, historico);
  const produtoFav = calcProdutoFavorito(card.pedidoOrigem, historico);

  function scrollToNota() {
    const el = document.getElementById('nota-input');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => el?.focus(), 300);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Header card={card} stats={stats} produtoFav={produtoFav} onAdicionarNota={scrollToNota} />
      <PedidoOrigemSection pedido={card.pedidoOrigem} />
      <HistoricoSection historico={historico} cardContatoId={card.contato.id} />
      <TimelineSection cardId={card.id} atividades={card.atividades} comentarios={card.comentarios} />
    </div>
  );
}

// --- Stage stepper ---

const COLUNAS_ORDER = ['pendente', 'em_contato', 'finalizado'] as const;
const COLUNA_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  em_contato: 'Em Contato',
  finalizado: 'Finalizado',
  arquivo: 'Arquivado',
};

function EtapaStepper({ card }: { card: Pick<CardData, 'id' | 'coluna' | 'tipo'> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const idx = COLUNAS_ORDER.indexOf(card.coluna as (typeof COLUNAS_ORDER)[number]);
  const prevColuna = idx > 0 ? COLUNAS_ORDER[idx - 1] : null;
  const nextColuna = idx < COLUNAS_ORDER.length - 1 ? COLUNAS_ORDER[idx + 1] : null;

  function moverPara(coluna: string) {
    startTransition(async () => {
      const resp = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coluna }),
      });
      if (!resp.ok) { toast.error('Falha ao mover card.'); return; }
      toast.success(`Movido para ${COLUNA_LABELS[coluna]}.`);
      router.refresh();
    });
  }

  if (card.coluna === 'arquivo') {
    return (
      <span className="inline-block text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
        Arquivado
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        {COLUNAS_ORDER.map((c, i) => (
          <span key={c} className="flex items-center gap-1">
            <span className={`text-xs px-2 py-0.5 rounded ${
              c === card.coluna
                ? 'bg-primary text-primary-foreground font-medium'
                : i < idx
                ? 'text-muted-foreground line-through'
                : 'text-muted-foreground'
            }`}>
              {COLUNA_LABELS[c]}
            </span>
            {i < COLUNAS_ORDER.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
          </span>
        ))}
      </div>
      <div className="flex gap-2 ml-auto">
        {prevColuna && (
          <button onClick={() => moverPara(prevColuna)} disabled={pending}
            className="text-xs border px-3 py-1 rounded-md hover:bg-muted disabled:opacity-50 transition-colors">
            ← {COLUNA_LABELS[prevColuna]}
          </button>
        )}
        {nextColuna && (
          <button onClick={() => moverPara(nextColuna)} disabled={pending}
            className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity">
            {card.tipo === 'pos_venda' && nextColuna === 'finalizado'
              ? 'Finalizar (arquiva) →'
              : `${COLUNA_LABELS[nextColuna]} →`}
          </button>
        )}
      </div>
    </div>
  );
}

// --- Header with stats bar + quick actions ---

function StatCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-base font-semibold ${className ?? ''}`}>{value}</p>
    </div>
  );
}

function Header({
  card,
  stats,
  produtoFav,
  onAdicionarNota,
}: {
  card: CardData;
  stats: Stats;
  produtoFav: string | null;
  onAdicionarNota: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const diasNaEtapa = Math.floor((Date.now() - new Date(card.colunaDeSde).getTime()) / 86_400_000);
  const etapaColor = diasNaEtapa > 14 ? 'text-red-600' : diasNaEtapa > 7 ? 'text-amber-600' : 'text-muted-foreground';

  const diasSemColor =
    stats.diasSemComprar == null ? 'text-muted-foreground'
    : stats.diasSemComprar > 120 ? 'text-red-600'
    : stats.diasSemComprar > 60 ? 'text-amber-600'
    : 'text-green-600';

  const tipoLabel = card.tipo === 'pos_venda' ? 'Pós-venda' : `Reativação ${card.tentativasReativacao}/3`;
  const tipoColor = card.tipo === 'pos_venda'
    ? 'bg-blue-50 text-blue-700 border-blue-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';

  function abrirWhatsapp() {
    const fone = card.contato.telefone;
    if (!fone) return;
    const numero = fone.length < 12 ? `55${fone}` : fone;
    window.open(`https://wa.me/${numero}`, '_blank', 'noopener,noreferrer');
  }

  function agendarAmanha() {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    amanha.setHours(9, 0, 0, 0);
    startTransition(async () => {
      const resp = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataPrevistaAcao: amanha.toISOString() }),
      });
      if (!resp.ok) { toast.error('Falha ao agendar.'); return; }
      toast.success('Retorno agendado para amanhã (9h).');
      router.refresh();
    });
  }

  return (
    <section className="border rounded-lg p-4 bg-card space-y-4">
      {/* Identity + quick actions */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{card.contato.nome}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{card.nomeExibido}</p>
          <p className="text-sm mt-1 text-muted-foreground space-x-3">
            {card.contato.telefone && <span>📱 {card.contato.telefone}</span>}
            {card.contato.email && <span>✉️ {card.contato.email}</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
          <button onClick={abrirWhatsapp} disabled={!card.contato.telefone}
            className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity">
            WhatsApp
          </button>
          <button onClick={onAdicionarNota}
            className="border px-3 py-1.5 rounded-md text-sm hover:bg-muted transition-colors">
            + Nota
          </button>
          <button onClick={agendarAmanha} disabled={pending}
            className="border px-3 py-1.5 rounded-md text-sm hover:bg-muted transition-colors disabled:opacity-50">
            Agendar amanhã
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {stats.numPedidos > 0 && (
        <div className="grid grid-cols-4 gap-2 border rounded-md p-3 bg-muted/30">
          <StatCard label="Total gasto" value={formatCurrency(stats.ltv)} />
          <StatCard label="Pedidos" value={String(stats.numPedidos)} />
          <StatCard label="Ticket médio" value={formatCurrency(stats.ticketMedio)} />
          <StatCard
            label="Dias sem comprar"
            value={stats.diasSemComprar != null ? String(stats.diasSemComprar) : '—'}
            className={diasSemColor}
          />
        </div>
      )}

      {/* Product affinity */}
      {produtoFav && (
        <p className="text-xs text-muted-foreground">
          Compra principalmente:{' '}
          <span className="font-medium text-foreground">{produtoFav}</span>
        </p>
      )}

      {/* Stage + meta */}
      <div className="space-y-2 pt-1 border-t">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded border ${tipoColor}`}>{tipoLabel}</span>
          <span className={`text-xs ${etapaColor}`}>
            {diasNaEtapa === 0 ? 'Hoje' : `${diasNaEtapa}d`} nesta etapa
          </span>
          {card.dataPrevistaAcao && (
            <span className="text-xs text-muted-foreground">
              · Ação prevista: {formatDate(card.dataPrevistaAcao)}
            </span>
          )}
        </div>
        <EtapaStepper card={card} />
      </div>
    </section>
  );
}

// --- ItensTable ---

function ItensTable({ itens }: { itens: PedidoItem[] }) {
  if (itens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Itens não disponíveis (pedido sincronizado sem detalhe).
      </p>
    );
  }
  return (
    <table className="w-full text-sm mt-2">
      <thead className="text-left text-muted-foreground">
        <tr>
          <th className="py-1 pr-2">Item</th>
          <th className="py-1 pr-2">Qtd</th>
          <th className="py-1 text-right pr-2">Unit.</th>
          <th className="py-1 text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((i) => (
          <tr key={i.id} className="border-t">
            <td className="py-1 pr-2">{i.descricao}</td>
            <td className="py-1 pr-2">{i.quantidade}</td>
            <td className="py-1 text-right pr-2">{formatCurrency(i.valorUnitario)}</td>
            <td className="py-1 text-right">{formatCurrency(i.valorTotal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --- PedidoOrigemSection ---

function PedidoOrigemSection({ pedido }: { pedido: PedidoOrigem | null }) {
  if (!pedido) {
    return (
      <section className="border rounded-lg p-4 bg-card">
        <h2 className="font-medium mb-2">Pedido de origem</h2>
        <p className="text-sm text-muted-foreground">Card sem pedido de origem.</p>
      </section>
    );
  }
  return (
    <section className="border rounded-lg p-4 bg-card">
      <h2 className="font-medium mb-1">
        Pedido #{pedido.numero} · {formatDate(pedido.data)} ·{' '}
        <span className="font-semibold">{formatCurrency(pedido.total)}</span>
      </h2>
      <ItensTable itens={pedido.itens} />
    </section>
  );
}

// --- HistoricoSection ---

function HistoricoSection({
  historico,
  cardContatoId,
}: {
  historico: PedidoHistorico[];
  cardContatoId: number;
}) {
  void cardContatoId;
  const [expandido, setExpandido] = useState<number | null>(null);

  return (
    <section className="border rounded-lg p-4 bg-card">
      <h2 className="font-medium mb-3">Histórico de compras — últimos 10</h2>
      {historico.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem pedidos anteriores.</p>
      ) : (
        <ul className="text-sm divide-y">
          {historico.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setExpandido(expandido === p.id ? null : p.id)}
                className="w-full flex justify-between items-center py-2 hover:bg-muted/50 px-1 rounded text-left"
              >
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">{expandido === p.id ? '▾' : '▸'}</span>
                  <span>#{p.numero} · {formatDate(p.data)}</span>
                </span>
                <span className="text-right text-muted-foreground">{formatCurrency(p.total)}</span>
              </button>
              {expandido === p.id && (
                <div className="px-4 pb-3">
                  <ItensTable itens={p.itens} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- TimelineSection (atividades + notas unificadas) ---

type TimelineEntry =
  | { kind: 'atividade'; id: number; titulo: string; status: string; date: Date }
  | { kind: 'nota'; id: number; texto: string; autor: string; date: Date };

function TimelineSection({
  cardId,
  atividades,
  comentarios,
}: {
  cardId: number;
  atividades: Atividade[];
  comentarios: Comentario[];
}) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [pending, startTransition] = useTransition();

  const entries: TimelineEntry[] = [
    ...atividades.map((a) => ({
      kind: 'atividade' as const,
      id: a.id,
      titulo: a.titulo,
      status: a.status,
      date: new Date(a.dataAgendada),
    })),
    ...comentarios.map((c) => ({
      kind: 'nota' as const,
      id: c.id,
      texto: c.texto,
      autor: c.usuario.nome ?? c.usuario.email,
      date: new Date(c.criadoEm),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  function adicionar() {
    if (!texto.trim()) return;
    startTransition(async () => {
      try {
        const resp = await fetch(`/api/cards/${cardId}/comentarios`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto }),
        });
        if (!resp.ok) throw new Error('falha');
        setTexto('');
        router.refresh();
      } catch {
        toast.error('Falha ao salvar nota.');
      }
    });
  }

  return (
    <section className="border rounded-lg p-4 bg-card">
      <h2 className="font-medium mb-3">Atividades & Notas</h2>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-4">Nenhuma atividade ou nota registrada.</p>
      ) : (
        <ul className="space-y-3 mb-4">
          {entries.map((entry) => (
            <li key={`${entry.kind}-${entry.id}`} className="flex gap-3 text-sm">
              <span className="mt-0.5 flex-shrink-0 text-base">
                {entry.kind === 'atividade' ? '📋' : '💬'}
              </span>
              <div className="flex-1 min-w-0">
                {entry.kind === 'atividade' ? (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{entry.titulo}</span>
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{entry.status}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mb-0.5">
                      {entry.autor} · {entry.date.toLocaleString('pt-BR')}
                    </p>
                    <p className="break-words">{entry.texto}</p>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add note */}
      <div className="flex gap-2 border-t pt-3">
        <textarea
          id="nota-input"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) adicionar(); }}
          rows={2}
          className="flex-1 border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Adicionar nota interna… (Ctrl+Enter para salvar)"
        />
        <button
          onClick={adicionar}
          disabled={pending || !texto.trim()}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm self-start disabled:opacity-50"
        >
          {pending ? '…' : 'Salvar'}
        </button>
      </div>
    </section>
  );
}
