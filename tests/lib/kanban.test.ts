import { describe, expect, it } from 'vitest';
import {
  DIAS_REATIVACAO,
  HORAS_ESPERA_FINALIZACAO,
  proximaTransicaoAutomatica,
  transicaoPorNovaCompra,
  type CardInput,
  type ContatoInput,
  type PedidoInput,
  type Transicao,
} from '@/lib/kanban';
import { addDays, addHours, toBRT } from '@/lib/time';

function deve(t: Transicao | null): Transicao {
  if (!t) throw new Error('Esperava transição não-nula');
  return t;
}

function makeCard(overrides: Partial<CardInput> = {}): CardInput {
  return {
    id: 1,
    contatoId: 100,
    tipo: 'pos_venda',
    coluna: 'pendente',
    tentativasReativacao: 0,
    dataPrevistaAcao: null,
    atualizadoEm: new Date('2026-06-01T10:00:00-03:00'),
    ...overrides,
  };
}

const AGORA = new Date('2026-06-15T10:00:00-03:00');

describe('proximaTransicaoAutomatica', () => {
  it('finalizado + dataPrevistaAcao vencida → criar_reativacao_d90', () => {
    const card = makeCard({
      coluna: 'finalizado',
      dataPrevistaAcao: addHours(AGORA, -HORAS_ESPERA_FINALIZACAO - 1).toJSDate(),
    });
    const t = deve(proximaTransicaoAutomatica(card, AGORA));
    expect(t.tipo).toBe('criar_reativacao_d90');
    if (t.tipo === 'criar_reativacao_d90') {
      expect(t.cardId).toBe(card.id);
      expect(t.contatoId).toBe(card.contatoId);
    }
  });

  it('finalizado + dataPrevistaAcao ainda no futuro → null', () => {
    const card = makeCard({
      coluna: 'finalizado',
      dataPrevistaAcao: addHours(AGORA, 1).toJSDate(),
    });
    expect(proximaTransicaoAutomatica(card, AGORA)).toBeNull();
  });

  it('finalizado + dataPrevistaAcao nula → null (aguarda agendamento)', () => {
    const card = makeCard({ coluna: 'finalizado', dataPrevistaAcao: null });
    expect(proximaTransicaoAutomatica(card, AGORA)).toBeNull();
  });

  it('pendente → null (transições manuais)', () => {
    const card = makeCard({ coluna: 'pendente', dataPrevistaAcao: addDays(AGORA, -1).toJSDate() });
    expect(proximaTransicaoAutomatica(card, AGORA)).toBeNull();
  });

  it('em_contato → null (transições manuais)', () => {
    const card = makeCard({ coluna: 'em_contato', atualizadoEm: addHours(AGORA, -72).toJSDate() });
    expect(proximaTransicaoAutomatica(card, AGORA)).toBeNull();
  });

  it('arquivo → null', () => {
    const card = makeCard({ coluna: 'arquivo', dataPrevistaAcao: addDays(AGORA, -10).toJSDate() });
    expect(proximaTransicaoAutomatica(card, AGORA)).toBeNull();
  });

  it('reativacao finalizado + dpa vencida → criar_reativacao_d90 (mesmo tipo)', () => {
    const card = makeCard({
      tipo: 'reativacao',
      coluna: 'finalizado',
      dataPrevistaAcao: addHours(AGORA, -25).toJSDate(),
    });
    const t = deve(proximaTransicaoAutomatica(card, AGORA));
    expect(t.tipo).toBe('criar_reativacao_d90');
  });

  it('TZ — dataPrevistaAcao em UTC interpretada corretamente em BRT', () => {
    const dpaUtc = new Date('2026-06-15T12:59:00Z'); // = 09:59 BRT < 10:00 BRT (AGORA)
    const card = makeCard({ coluna: 'finalizado', dataPrevistaAcao: dpaUtc });
    const t = deve(proximaTransicaoAutomatica(card, AGORA));
    expect(t.tipo).toBe('criar_reativacao_d90');
  });
});

describe('transicaoPorNovaCompra', () => {
  const contato: ContatoInput = { id: 100, freezingAte: null };
  const pedido: PedidoInput = {
    id: 999,
    contatoId: 100,
    dataSaida: new Date('2026-06-10T10:00:00-03:00'),
    data: new Date('2026-06-10T10:00:00-03:00'),
  };

  it('contato com card ativo → cancela + cria pos_venda com dpa D+14', () => {
    const cardAtivo = makeCard({ tipo: 'reativacao', coluna: 'pendente', id: 77 });
    const t = transicaoPorNovaCompra(contato, pedido, cardAtivo);
    expect(t.tipo).toBe('cancelar_e_criar_pos_venda');
    expect(t.cancelarCardId).toBe(77);
    expect(t.criarNovoCard.tipo).toBe('pos_venda');
    expect(t.criarNovoCard.pedidoIdOrigem).toBe(pedido.id);
    const esperado = addDays(pedido.dataSaida!, 14).toJSDate();
    expect(t.criarNovoCard.dataPrevistaAcao.getTime()).toBe(esperado.getTime());
  });

  it('contato sem card ativo → cancelarCardId=null + cria pos_venda', () => {
    const t = transicaoPorNovaCompra(contato, pedido, null);
    expect(t.cancelarCardId).toBeNull();
    expect(t.criarNovoCard.tipo).toBe('pos_venda');
  });

  it('pedido sem dataSaida usa pedido.data como base do D+14', () => {
    const semSaida: PedidoInput = { ...pedido, dataSaida: null };
    const t = transicaoPorNovaCompra(contato, semSaida, null);
    const esperado = addDays(semSaida.data!, 14).toJSDate();
    expect(t.criarNovoCard.dataPrevistaAcao.getTime()).toBe(esperado.getTime());
  });

  it('DIAS_REATIVACAO = 90', () => {
    expect(DIAS_REATIVACAO).toBe(90);
  });

  it('HORAS_ESPERA_FINALIZACAO = 24', () => {
    expect(HORAS_ESPERA_FINALIZACAO).toBe(24);
  });
});
