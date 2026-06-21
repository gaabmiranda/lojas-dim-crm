import type { ColunaCard, TipoCard } from '@/db/schema';
import { addDays, toBRT } from '@/lib/time';

// ─── Constantes da régua de relacionamento ───────────────────────────────
export const HORAS_ESPERA_FINALIZACAO = 24;
export const DIAS_REATIVACAO = 90;

// ─── Input mínimo de card aceito pela máquina de estados ─────────────────
export interface CardInput {
  id: number;
  contatoId: number;
  tipo: TipoCard;
  coluna: ColunaCard;
  tentativasReativacao: number;
  dataPrevistaAcao: Date | null;
  atualizadoEm: Date;
}

export interface ContatoInput {
  id: number;
  freezingAte: Date | null;
}

export interface PedidoInput {
  id: number;
  contatoId: number;
  dataSaida: Date | null;
  data: Date | null;
}

// ─── Discriminated union de transições ───────────────────────────────────
export type Transicao = CriarReativacaoD90 | CancelarECriarPosVenda;

// Cron detecta card em 'finalizado' com dataPrevistaAcao vencida → arquiva e cria reativacao D+90.
export interface CriarReativacaoD90 {
  tipo: 'criar_reativacao_d90';
  cardId: number;
  contatoId: number;
}

export interface CancelarECriarPosVenda {
  tipo: 'cancelar_e_criar_pos_venda';
  cancelarCardId: number | null;
  criarNovoCard: {
    tipo: 'pos_venda';
    contatoId: number;
    pedidoIdOrigem: number;
    dataPrevistaAcao: Date;
  };
}

// ─── proximaTransicaoAutomatica ──────────────────────────────────────────
// Avaliada pelo cron /api/cron/transitions. Pura — sem I/O.
// Única transição automática: card em 'finalizado' com janela de 24h vencida → reativação D+90.
// Todas as outras transições são manuais (vendedor avança/volta etapas).
export function proximaTransicaoAutomatica(card: CardInput, agora: Date): Transicao | null {
  if (card.coluna !== 'finalizado') return null;

  const dpa = card.dataPrevistaAcao ? toBRT(card.dataPrevistaAcao) : null;
  if (!dpa || dpa > toBRT(agora)) return null;

  return {
    tipo: 'criar_reativacao_d90',
    cardId: card.id,
    contatoId: card.contatoId,
  };
}

// ─── transicaoPorNovaCompra ──────────────────────────────────────────────
// Webhook Bling indica novo pedido ATENDIDO.
// Se há card ativo (qualquer coluna != arquivo), cancela e cria pos_venda novo.
export function transicaoPorNovaCompra(
  contato: ContatoInput,
  novoPedido: PedidoInput,
  cardAtivo: CardInput | null,
): CancelarECriarPosVenda {
  const base = novoPedido.dataSaida ?? novoPedido.data ?? new Date();
  const dpa = addDays(base, 14).toJSDate();
  void contato;

  return {
    tipo: 'cancelar_e_criar_pos_venda',
    cancelarCardId: cardAtivo?.id ?? null,
    criarNovoCard: {
      tipo: 'pos_venda',
      contatoId: novoPedido.contatoId,
      pedidoIdOrigem: novoPedido.id,
      dataPrevistaAcao: dpa,
    },
  };
}
