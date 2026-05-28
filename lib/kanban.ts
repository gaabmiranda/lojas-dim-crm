import type { ColunaCard, TipoCard } from '@/db/schema';
import type { TemplateKey } from '@/lib/templates';
import { addDays, addHours, addMonths, toBRT } from '@/lib/time';

// ─── Constantes da régua de relacionamento ───────────────────────────────
export const HORAS_SEM_RESPOSTA = 48;
export const DIAS_REATIVACAO = 90;
export const MAX_TENTATIVAS_REATIVACAO = 3;
export const MESES_FREEZING = 12;

// ─── Input mínimo de card aceito pela máquina de estados ─────────────────
// Tipado deliberadamente como subset do row de DB — funções aqui não fazem I/O.
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
// Cada variant carrega EXATAMENTE o que o caller precisa fazer no DB.
// O caller é responsável por: persistir a transição + chamar Chatwoot + logar evento.
export type Transicao =
  | EnviarMensagemD14
  | FinalizarSemRespostaPv
  | EnviarReativacao
  | ReagendarReativacao
  | ArquivarReativacao
  | FinalizarPorResposta
  | CancelarECriarPosVenda;

export interface EnviarMensagemD14 {
  tipo: 'enviar_mensagem_d14';
  cardId: number;
  novaColuna: 'em_contato';
  template: 'pos_venda_d14';
}

export interface FinalizarSemRespostaPv {
  tipo: 'finalizar_sem_resposta_pv';
  cardId: number;
  novaColuna: 'finalizado';
  criarNovoCard: {
    tipo: 'reativacao';
    contatoId: number;
    dataPrevistaAcao: Date;
  };
}

export interface EnviarReativacao {
  tipo: 'enviar_reativacao';
  cardId: number;
  novaColuna: 'em_contato';
  template: TemplateKey;
  numeroTentativa: number;
  novaTentativasReativacao: number;
}

export interface ReagendarReativacao {
  tipo: 'reagendar_reativacao';
  cardId: number;
  novaColuna: 'pendente';
  novaDataPrevistaAcao: Date;
}

export interface ArquivarReativacao {
  tipo: 'arquivar_reativacao';
  cardId: number;
  contatoId: number;
  novaColuna: 'arquivo';
  freezingContatoAte: Date;
}

export interface FinalizarPorResposta {
  tipo: 'finalizar_por_resposta';
  cardId: number;
  novaColuna: 'finalizado';
  criarNovoCard: {
    tipo: 'reativacao';
    contatoId: number;
    dataPrevistaAcao: Date;
  };
  notificarVendedor: true;
}

export interface CancelarECriarPosVenda {
  tipo: 'cancelar_e_criar_pos_venda';
  cancelarCardId: number | null; // null se não havia card ativo
  criarNovoCard: {
    tipo: 'pos_venda';
    contatoId: number;
    pedidoIdOrigem: number;
    dataPrevistaAcao: Date;
  };
}

// ─── proximaTransicaoAutomatica ──────────────────────────────────────────
// Avaliada pelo cron /api/cron/transitions. Pura — sem I/O.
//
// Notas sobre tentativas_reativacao:
// - tentativas é INCREMENTADO ao enviar (case `enviar_reativacao`), não ao reagendar.
//   Isso garante: tentativas representa "mensagens já enviadas neste ciclo".
//   Cap em MAX_TENTATIVAS_REATIVACAO (3) — o 4º "enviar" vira "arquivar".
// - Spec original menciona incremento no reagendamento, mas isso produz N=4 no envio
//   seguinte sem template correspondente. Esta é uma reconciliação documentada.
export function proximaTransicaoAutomatica(card: CardInput, agora: Date): Transicao | null {
  const agoraDT = toBRT(agora);

  // Card arquivado: sem transição automática.
  if (card.coluna === 'arquivo' || card.coluna === 'finalizado') {
    return null;
  }

  // ─── Pos-venda ─────────────────────────────────────────────────────────
  if (card.tipo === 'pos_venda') {
    if (card.coluna === 'pendente' && card.dataPrevistaAcao) {
      if (toBRT(card.dataPrevistaAcao) <= agoraDT) {
        return {
          tipo: 'enviar_mensagem_d14',
          cardId: card.id,
          novaColuna: 'em_contato',
          template: 'pos_venda_d14',
        };
      }
    }

    if (card.coluna === 'em_contato') {
      const limite = addHours(card.atualizadoEm, HORAS_SEM_RESPOSTA);
      if (limite <= agoraDT) {
        return {
          tipo: 'finalizar_sem_resposta_pv',
          cardId: card.id,
          novaColuna: 'finalizado',
          criarNovoCard: {
            tipo: 'reativacao',
            contatoId: card.contatoId,
            dataPrevistaAcao: addDays(card.atualizadoEm, DIAS_REATIVACAO).toJSDate(),
          },
        };
      }
    }
    return null;
  }

  // ─── Reativação ────────────────────────────────────────────────────────
  if (card.tipo === 'reativacao') {
    if (card.coluna === 'em_contato') {
      const limite = addHours(card.atualizadoEm, HORAS_SEM_RESPOSTA);
      if (limite <= agoraDT) {
        if (card.tentativasReativacao >= MAX_TENTATIVAS_REATIVACAO) {
          return arquivarReativacaoTransicao(card, agora);
        }
        return {
          tipo: 'reagendar_reativacao',
          cardId: card.id,
          novaColuna: 'pendente',
          novaDataPrevistaAcao: addDays(card.atualizadoEm, DIAS_REATIVACAO).toJSDate(),
        };
      }
    }

    if (card.coluna === 'pendente' && card.dataPrevistaAcao) {
      if (toBRT(card.dataPrevistaAcao) <= agoraDT) {
        // Defensa: se tentativas já bateu o teto, arquiva ao invés de enviar template inexistente.
        if (card.tentativasReativacao >= MAX_TENTATIVAS_REATIVACAO) {
          return arquivarReativacaoTransicao(card, agora);
        }
        const numeroTentativa = card.tentativasReativacao + 1;
        const template = `reativacao_${numeroTentativa}` as TemplateKey;
        return {
          tipo: 'enviar_reativacao',
          cardId: card.id,
          novaColuna: 'em_contato',
          template,
          numeroTentativa,
          novaTentativasReativacao: numeroTentativa,
        };
      }
    }
    return null;
  }

  return null;
}

function arquivarReativacaoTransicao(card: CardInput, agora: Date): ArquivarReativacao {
  return {
    tipo: 'arquivar_reativacao',
    cardId: card.id,
    contatoId: card.contatoId,
    novaColuna: 'arquivo',
    freezingContatoAte: addMonths(agora, MESES_FREEZING).toJSDate(),
  };
}

// ─── transicaoPorResposta ────────────────────────────────────────────────
// Disparada pelo webhook Chatwoot quando cliente responde.
// Cliente respondeu = pos_venda termina com sucesso + cria card de reativação futura.
// Se card é de reativação que recebeu resposta: também finaliza (cliente engajou).
export function transicaoPorResposta(card: CardInput, agora: Date): Transicao | null {
  if (card.coluna !== 'em_contato') {
    // Resposta chegou mas card não está em_contato (ex: já arquivado) — nada a fazer aqui.
    return null;
  }

  const novoCardDpa = addDays(agora, DIAS_REATIVACAO).toJSDate();

  return {
    tipo: 'finalizar_por_resposta',
    cardId: card.id,
    novaColuna: 'finalizado',
    criarNovoCard: {
      tipo: 'reativacao',
      contatoId: card.contatoId,
      dataPrevistaAcao: novoCardDpa,
    },
    notificarVendedor: true,
  };
}

// ─── transicaoPorNovaCompra ──────────────────────────────────────────────
// Webhook Bling indica novo pedido ATENDIDO.
// Se há card ativo (qualquer coluna != arquivo), cancela e cria pos_venda novo.
// Se não há card ativo, apenas cria pos_venda.
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
