import { describe, expect, it } from 'vitest';
import {
  DIAS_REATIVACAO,
  HORAS_SEM_RESPOSTA,
  MAX_TENTATIVAS_REATIVACAO,
  MESES_FREEZING,
  proximaTransicaoAutomatica,
  transicaoPorNovaCompra,
  transicaoPorResposta,
  type CardInput,
  type ContatoInput,
  type PedidoInput,
  type Transicao,
} from '@/lib/kanban';
import { addDays, addHours, addMonths, toBRT } from '@/lib/time';

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

describe('proximaTransicaoAutomatica — pos_venda', () => {
  it('1. pendente + data_prevista no passado → enviar_mensagem_d14', () => {
    const card = makeCard({
      tipo: 'pos_venda',
      coluna: 'pendente',
      dataPrevistaAcao: new Date('2026-06-14T10:00:00-03:00'),
    });
    const t = deve(proximaTransicaoAutomatica(card, AGORA));
    expect(t.tipo).toBe('enviar_mensagem_d14');
    if (t.tipo === 'enviar_mensagem_d14') {
      expect(t.novaColuna).toBe('em_contato');
      expect(t.template).toBe('pos_venda_d14');
      expect(t.cardId).toBe(card.id);
    }
  });

  it('2. pendente + data_prevista no futuro → null', () => {
    const card = makeCard({
      tipo: 'pos_venda',
      coluna: 'pendente',
      dataPrevistaAcao: addDays(AGORA, 1).toJSDate(),
    });
    expect(proximaTransicaoAutomatica(card, AGORA)).toBeNull();
  });

  it('3. em_contato + 48h passou → finalizar_sem_resposta_pv + criar reativacao D+90', () => {
    const atualizado = addHours(AGORA, -HORAS_SEM_RESPOSTA - 1).toJSDate();
    const card = makeCard({
      tipo: 'pos_venda',
      coluna: 'em_contato',
      atualizadoEm: atualizado,
    });
    const t = deve(proximaTransicaoAutomatica(card, AGORA));
    expect(t.tipo).toBe('finalizar_sem_resposta_pv');
    if (t.tipo === 'finalizar_sem_resposta_pv') {
      expect(t.novaColuna).toBe('finalizado');
      expect(t.criarNovoCard.tipo).toBe('reativacao');
      expect(t.criarNovoCard.contatoId).toBe(card.contatoId);
      const esperadoDpa = addDays(atualizado, DIAS_REATIVACAO).toJSDate();
      expect(t.criarNovoCard.dataPrevistaAcao.getTime()).toBe(esperadoDpa.getTime());
    }
  });

  it('4. em_contato + 47h (ainda não 48h) → null', () => {
    const card = makeCard({
      tipo: 'pos_venda',
      coluna: 'em_contato',
      atualizadoEm: addHours(AGORA, -47).toJSDate(),
    });
    expect(proximaTransicaoAutomatica(card, AGORA)).toBeNull();
  });

  it('pos_venda em coluna arquivo → null (não processa arquivados)', () => {
    const card = makeCard({
      tipo: 'pos_venda',
      coluna: 'arquivo',
      dataPrevistaAcao: addDays(AGORA, -10).toJSDate(),
    });
    expect(proximaTransicaoAutomatica(card, AGORA)).toBeNull();
  });
});

describe('proximaTransicaoAutomatica — reativacao envio', () => {
  it('5. pendente, tentativas=0, dpa passou → enviar_reativacao com template reativacao_1', () => {
    const card = makeCard({
      tipo: 'reativacao',
      coluna: 'pendente',
      tentativasReativacao: 0,
      dataPrevistaAcao: addDays(AGORA, -1).toJSDate(),
    });
    const t = deve(proximaTransicaoAutomatica(card, AGORA));
    expect(t.tipo).toBe('enviar_reativacao');
    if (t.tipo === 'enviar_reativacao') {
      expect(t.template).toBe('reativacao_1');
      expect(t.numeroTentativa).toBe(1);
      expect(t.novaTentativasReativacao).toBe(1);
      expect(t.novaColuna).toBe('em_contato');
    }
  });

  it('6. pendente, tentativas=1, dpa passou → enviar reativacao_2', () => {
    const card = makeCard({
      tipo: 'reativacao',
      coluna: 'pendente',
      tentativasReativacao: 1,
      dataPrevistaAcao: addDays(AGORA, -1).toJSDate(),
    });
    const t = deve(proximaTransicaoAutomatica(card, AGORA));
    expect(t.tipo).toBe('enviar_reativacao');
    if (t.tipo === 'enviar_reativacao') {
      expect(t.template).toBe('reativacao_2');
      expect(t.numeroTentativa).toBe(2);
      expect(t.novaTentativasReativacao).toBe(2);
    }
  });

  it('7. pendente, tentativas=2, dpa passou → enviar reativacao_3', () => {
    const card = makeCard({
      tipo: 'reativacao',
      coluna: 'pendente',
      tentativasReativacao: 2,
      dataPrevistaAcao: addDays(AGORA, -1).toJSDate(),
    });
    const t = deve(proximaTransicaoAutomatica(card, AGORA));
    expect(t.tipo).toBe('enviar_reativacao');
    if (t.tipo === 'enviar_reativacao') {
      expect(t.template).toBe('reativacao_3');
      expect(t.numeroTentativa).toBe(3);
    }
  });
});

describe('proximaTransicaoAutomatica — reativacao reagendamento e arquivamento', () => {
  it('8. em_contato, tentativas=1, 48h passou → reagendar_reativacao com dpa = atualizadoEm+90d', () => {
    const atualizado = addHours(AGORA, -HORAS_SEM_RESPOSTA - 1).toJSDate();
    const card = makeCard({
      tipo: 'reativacao',
      coluna: 'em_contato',
      tentativasReativacao: 1,
      atualizadoEm: atualizado,
    });
    const t = deve(proximaTransicaoAutomatica(card, AGORA));
    expect(t.tipo).toBe('reagendar_reativacao');
    if (t.tipo === 'reagendar_reativacao') {
      expect(t.novaColuna).toBe('pendente');
      const esperado = addDays(atualizado, DIAS_REATIVACAO).toJSDate();
      expect(t.novaDataPrevistaAcao.getTime()).toBe(esperado.getTime());
    }
  });

  it('9. em_contato, tentativas=2, 48h passou → reagendar (ainda < MAX=3)', () => {
    const card = makeCard({
      tipo: 'reativacao',
      coluna: 'em_contato',
      tentativasReativacao: 2,
      atualizadoEm: addHours(AGORA, -50).toJSDate(),
    });
    const t = deve(proximaTransicaoAutomatica(card, AGORA));
    expect(t.tipo).toBe('reagendar_reativacao');
  });

  it('10. em_contato, tentativas=3, 48h passou → arquivar_reativacao + freezing 12 meses', () => {
    const card = makeCard({
      tipo: 'reativacao',
      coluna: 'em_contato',
      tentativasReativacao: MAX_TENTATIVAS_REATIVACAO,
      atualizadoEm: addHours(AGORA, -50).toJSDate(),
    });
    const t = deve(proximaTransicaoAutomatica(card, AGORA));
    expect(t.tipo).toBe('arquivar_reativacao');
    if (t.tipo === 'arquivar_reativacao') {
      expect(t.novaColuna).toBe('arquivo');
      const esperadoFreezing = addMonths(AGORA, MESES_FREEZING).toJSDate();
      expect(t.freezingContatoAte.getTime()).toBe(esperadoFreezing.getTime());
      expect(t.contatoId).toBe(card.contatoId);
    }
  });

  it('11. em_contato, tentativas=2, 47h (ainda não 48h) → null', () => {
    const card = makeCard({
      tipo: 'reativacao',
      coluna: 'em_contato',
      tentativasReativacao: 2,
      atualizadoEm: addHours(AGORA, -47).toJSDate(),
    });
    expect(proximaTransicaoAutomatica(card, AGORA)).toBeNull();
  });

  it('12. defensa: pendente + tentativas=3 + dpa passou → arquivar (não envia reativacao_4)', () => {
    const card = makeCard({
      tipo: 'reativacao',
      coluna: 'pendente',
      tentativasReativacao: MAX_TENTATIVAS_REATIVACAO,
      dataPrevistaAcao: addDays(AGORA, -1).toJSDate(),
    });
    const t = deve(proximaTransicaoAutomatica(card, AGORA));
    expect(t.tipo).toBe('arquivar_reativacao');
  });
});

describe('transicaoPorResposta', () => {
  it('13. card em_contato → finalizar_por_resposta + notificar + criar reativacao futuro', () => {
    const card = makeCard({ coluna: 'em_contato' });
    const t = deve(transicaoPorResposta(card, AGORA));
    expect(t.tipo).toBe('finalizar_por_resposta');
    if (t.tipo === 'finalizar_por_resposta') {
      expect(t.novaColuna).toBe('finalizado');
      expect(t.notificarVendedor).toBe(true);
      expect(t.criarNovoCard.tipo).toBe('reativacao');
      const esperado = addDays(AGORA, DIAS_REATIVACAO).toJSDate();
      expect(t.criarNovoCard.dataPrevistaAcao.getTime()).toBe(esperado.getTime());
    }
  });

  it('14. card já finalizado / arquivo → null (ignora)', () => {
    expect(transicaoPorResposta(makeCard({ coluna: 'finalizado' }), AGORA)).toBeNull();
    expect(transicaoPorResposta(makeCard({ coluna: 'arquivo' }), AGORA)).toBeNull();
    expect(transicaoPorResposta(makeCard({ coluna: 'pendente' }), AGORA)).toBeNull();
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

  it('15. contato com card reativacao ativo → cancela + cria pos_venda', () => {
    const cardAtivo = makeCard({
      tipo: 'reativacao',
      coluna: 'pendente',
      id: 77,
    });
    const t = transicaoPorNovaCompra(contato, pedido, cardAtivo);
    expect(t.tipo).toBe('cancelar_e_criar_pos_venda');
    expect(t.cancelarCardId).toBe(77);
    expect(t.criarNovoCard.tipo).toBe('pos_venda');
    expect(t.criarNovoCard.pedidoIdOrigem).toBe(pedido.id);
    expect(t.criarNovoCard.contatoId).toBe(pedido.contatoId);
    const esperado = addDays(pedido.dataSaida!, 14).toJSDate();
    expect(t.criarNovoCard.dataPrevistaAcao.getTime()).toBe(esperado.getTime());
  });

  it('16. contato sem card ativo → cancelarCardId=null + cria pos_venda', () => {
    const t = transicaoPorNovaCompra(contato, pedido, null);
    expect(t.cancelarCardId).toBeNull();
    expect(t.criarNovoCard.tipo).toBe('pos_venda');
  });

  it('17. pedido sem dataSaida usa pedido.data como base', () => {
    const semSaida: PedidoInput = { ...pedido, dataSaida: null };
    const t = transicaoPorNovaCompra(contato, semSaida, null);
    const esperado = addDays(semSaida.data!, 14).toJSDate();
    expect(t.criarNovoCard.dataPrevistaAcao.getTime()).toBe(esperado.getTime());
  });
});

describe('invariantes/edge cases', () => {
  it('TZ — atualizadoEm em UTC equivale a BRT correspondente no cálculo 48h', () => {
    const atualizadoUtc = new Date('2026-06-13T13:00:00Z'); // = 10:00 BRT
    const agoraBrt = toBRT('2026-06-15T11:00:00-03:00').toJSDate();
    const card = makeCard({
      tipo: 'pos_venda',
      coluna: 'em_contato',
      atualizadoEm: atualizadoUtc,
    });
    const t = deve(proximaTransicaoAutomatica(card, agoraBrt));
    expect(t.tipo).toBe('finalizar_sem_resposta_pv');
  });

  it('coluna finalizado → null (não revisita)', () => {
    const card = makeCard({ coluna: 'finalizado' });
    expect(proximaTransicaoAutomatica(card, AGORA)).toBeNull();
  });
});
