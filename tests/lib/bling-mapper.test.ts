import { describe, expect, it } from 'vitest';
import { extrairTelefone, mapContato, mapPedido } from '@/lib/bling/mapper';
import type { BlingContato, BlingPedidoVenda } from '@/lib/bling/types';

describe('extrairTelefone', () => {
  it('prefere celular', () => {
    expect(
      extrairTelefone({
        id: 1,
        nome: 'X',
        celular: '38999998888',
        telefone: '3833334444',
      }),
    ).toBe('38999998888');
  });

  it('fallback pra telefone fixo se celular ausente', () => {
    expect(extrairTelefone({ id: 1, nome: 'X', telefone: '(38) 3333-4444' })).toBe('3833334444');
  });

  it('retorna undefined se nenhum válido', () => {
    expect(extrairTelefone({ id: 1, nome: 'X', telefone: '123' })).toBeUndefined();
    expect(extrairTelefone({ id: 1, nome: 'X' })).toBeUndefined();
  });
});

describe('mapContato', () => {
  it('preenche campos básicos + idBling como number', () => {
    const blingContato: BlingContato = {
      id: 17592187232931,
      nome: 'João da Silva',
      email: 'joao@example.com',
      celular: '38999998888',
      situacao: 'A',
    };
    const m = mapContato(blingContato);
    expect(m.idBling).toBe(17592187232931);
    expect(m.nome).toBe('João da Silva');
    expect(m.email).toBe('joao@example.com');
    expect(m.telefone).toBe('38999998888');
    expect(m.situacaoBling).toBe('A');
    expect(m.dadosExtrasJson).toBeDefined();
  });

  it('tolera campos faltantes', () => {
    const m = mapContato({ id: 1, nome: 'Mínimo' });
    expect(m.idBling).toBe(1);
    expect(m.nome).toBe('Mínimo');
    expect(m.telefone).toBeUndefined();
  });
});

describe('mapPedido', () => {
  const sample: BlingPedidoVenda = {
    id: 42,
    numero: 1001,
    data: '2026-06-10',
    dataSaida: '2026-06-12',
    total: 450.5,
    totalProdutos: 400,
    situacao: { id: 101, valor: 9 },
    contato: { id: 17592187232931, nome: 'Cliente' },
    itens: [
      { descricao: 'Retalho azul', quantidade: 2, valor: 200 },
      { descricao: 'Retalho vermelho', quantidade: 1, valor: 50.5 },
    ],
  };

  it('mapeia campos principais', () => {
    const { pedido, itens } = mapPedido(sample, 999);
    expect(pedido.idBling).toBe(42);
    expect(pedido.contatoId).toBe(999);
    expect(pedido.numero).toBe('1001');
    expect(pedido.situacaoId).toBe(101);
    expect(pedido.situacaoValor).toBe(9);
    expect(pedido.total).toBe('450.5');
    expect(itens).toHaveLength(2);
  });

  it('itens calculam valor_total = quantidade × valor_unitario', () => {
    const { itens } = mapPedido(sample, 999);
    expect(itens[0]!.valorTotal).toBe('400');
    expect(itens[1]!.valorTotal).toBe('50.5');
  });

  it('parseDate converte YYYY-MM-DD pra meia-noite BRT (03:00 UTC)', () => {
    const { pedido } = mapPedido(sample, 999);
    expect(pedido.data).toBeInstanceOf(Date);
    expect((pedido.data as Date).toISOString()).toBe('2026-06-10T03:00:00.000Z');
  });

  it('pedido sem itens retorna array vazio', () => {
    const { itens } = mapPedido({ ...sample, itens: undefined }, 999);
    expect(itens).toEqual([]);
  });
});
