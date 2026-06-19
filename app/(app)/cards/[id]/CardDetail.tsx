'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

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

export function CardDetail({ card, historico }: { card: CardData; historico: PedidoHistorico[] }) {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Header card={card} />
      <PedidoOrigemSection pedido={card.pedidoOrigem} />
      <HistoricoSection historico={historico} cardContatoId={card.contato.id} />
      <AtividadesSection atividades={card.atividades} />
      <ComentariosSection cardId={card.id} comentarios={card.comentarios} />
    </div>
  );
}

function formatCurrency(v: string | null) {
  if (!v) return '—';
  const n = Number(v);
  return Number.isNaN(n) ? v : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(d: Date | string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

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

  async function moverPara(coluna: string) {
    startTransition(async () => {
      const resp = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coluna }),
      });
      if (!resp.ok) {
        toast.error('Falha ao mover card.');
        return;
      }
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
      {/* Pipeline visual */}
      <div className="flex items-center gap-1">
        {COLUNAS_ORDER.map((c, i) => (
          <span key={c} className="flex items-center gap-1">
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                c === card.coluna
                  ? 'bg-primary text-primary-foreground font-medium'
                  : i < idx
                  ? 'text-muted-foreground line-through'
                  : 'text-muted-foreground'
              }`}
            >
              {COLUNA_LABELS[c]}
            </span>
            {i < COLUNAS_ORDER.length - 1 && (
              <span className="text-muted-foreground text-xs">→</span>
            )}
          </span>
        ))}
      </div>

      {/* Botões */}
      <div className="flex gap-2 ml-auto">
        {prevColuna && (
          <button
            onClick={() => moverPara(prevColuna)}
            disabled={pending}
            className="text-xs border px-3 py-1 rounded-md hover:bg-muted disabled:opacity-50 transition-colors"
          >
            ← {COLUNA_LABELS[prevColuna]}
          </button>
        )}
        {nextColuna && (
          <button
            onClick={() => moverPara(nextColuna)}
            disabled={pending}
            className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {card.tipo === 'pos_venda' && nextColuna === 'finalizado'
              ? 'Finalizar (arquiva) →'
              : `${COLUNA_LABELS[nextColuna]} →`}
          </button>
        )}
      </div>
    </div>
  );
}

function Header({ card }: { card: CardData }) {
  const [pending, startTransition] = useTransition();

  async function abrirWhatsapp() {
    startTransition(async () => {
      try {
        const resp = await fetch(`/api/cards/${card.id}/whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!resp.ok) throw new Error(await resp.text());
        toast.success('Conversa aberta no Chatwoot.');
      } catch (err) {
        toast.error('Falha ao abrir WhatsApp: ' + (err as Error).message);
      }
    });
  }

  const diasNaEtapa = Math.floor(
    (Date.now() - new Date(card.colunaDeSde).getTime()) / 86_400_000,
  );

  const tipoLabel =
    card.tipo === 'pos_venda'
      ? 'Pós-venda'
      : `Reativação ${card.tentativasReativacao}/3`;
  const tipoColor =
    card.tipo === 'pos_venda'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <section className="border rounded-lg p-4 bg-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{card.contato.nome}</h1>
          <p className="text-sm text-muted-foreground">{card.nomeExibido}</p>
          <p className="text-sm mt-2">
            {card.contato.telefone && <>📱 {card.contato.telefone}</>}
            {card.contato.email && (
              <span className="ml-3">✉️ {card.contato.email}</span>
            )}
          </p>
        </div>
        <button
          onClick={abrirWhatsapp}
          disabled={pending || !card.contato.telefone}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
        >
          {pending ? 'Abrindo…' : 'Abrir WhatsApp'}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {/* Tipo + info contextual */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded border ${tipoColor}`}>
            {tipoLabel}
          </span>
          <span className="text-xs text-muted-foreground">
            {diasNaEtapa === 0 ? 'Hoje' : diasNaEtapa === 1 ? '1 dia' : `${diasNaEtapa} dias`} nesta etapa
          </span>
          {card.dataPrevistaAcao && (
            <span className="text-xs text-muted-foreground">
              · Ação prevista: {formatDate(card.dataPrevistaAcao)}
            </span>
          )}
        </div>

        {/* Pipeline stepper */}
        <EtapaStepper card={card} />
      </div>
    </section>
  );
}

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
      <h2 className="font-medium mb-3">
        Pedido #{pedido.numero} — {formatDate(pedido.data)} — Total {formatCurrency(pedido.total)}
      </h2>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1">Item</th>
            <th className="py-1">Qtd</th>
            <th className="py-1 text-right">Unit.</th>
            <th className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {pedido.itens.map((i) => (
            <tr key={i.id} className="border-t">
              <td className="py-1">{i.descricao}</td>
              <td className="py-1">{i.quantidade}</td>
              <td className="py-1 text-right">{formatCurrency(i.valorUnitario)}</td>
              <td className="py-1 text-right">{formatCurrency(i.valorTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function HistoricoSection({
  historico,
  cardContatoId,
}: {
  historico: PedidoHistorico[];
  cardContatoId: number;
}) {
  void cardContatoId;
  return (
    <section className="border rounded-lg p-4 bg-card">
      <h2 className="font-medium mb-3">Histórico de compras — últimos 10</h2>
      {historico.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem pedidos anteriores.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {historico.map((p) => (
            <li key={p.id} className="flex justify-between border-b last:border-0 py-1">
              <span>#{p.numero} · {formatDate(p.data)}</span>
              <span>{formatCurrency(p.total)} · sit. {p.situacaoValor ?? '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AtividadesSection({ atividades }: { atividades: Atividade[] }) {
  return (
    <section className="border rounded-lg p-4 bg-card">
      <h2 className="font-medium mb-3">Atividades</h2>
      {atividades.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem atividades.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {atividades.map((a) => (
            <li key={a.id} className="flex justify-between">
              <span>
                {a.titulo} · <em className="text-muted-foreground">{a.status}</em>
              </span>
              <span>{formatDate(a.dataAgendada)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ComentariosSection({ cardId, comentarios }: { cardId: number; comentarios: Comentario[] }) {
  const [texto, setTexto] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function adicionar() {
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
        toast.error('Falha ao salvar comentário.');
      }
    });
  }

  return (
    <section className="border rounded-lg p-4 bg-card">
      <h2 className="font-medium mb-3">Comentários</h2>
      <div className="space-y-2 mb-4">
        {comentarios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
        ) : (
          comentarios.map((c) => (
            <div key={c.id} className="text-sm border-b pb-2">
              <p className="text-xs text-muted-foreground">
                {c.usuario.nome ?? c.usuario.email} · {new Date(c.criadoEm).toLocaleString('pt-BR')}
              </p>
              <p>{c.texto}</p>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          className="flex-1 border rounded-md px-3 py-2 text-sm"
          placeholder="Anotação interna…"
        />
        <button
          onClick={adicionar}
          disabled={pending || !texto.trim()}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm self-start disabled:opacity-50"
        >
          {pending ? '…' : 'Adicionar'}
        </button>
      </div>
    </section>
  );
}
