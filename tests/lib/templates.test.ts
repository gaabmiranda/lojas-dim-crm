import { describe, expect, it, vi } from 'vitest';
import { extrairPlaceholders, renderString } from '@/lib/templates';

describe('renderString', () => {
  it('substitui placeholder único', () => {
    expect(renderString('Olá, {{nome_cliente}}', { nome_cliente: 'João' })).toBe('Olá, João');
  });

  it('substitui múltiplos placeholders', () => {
    const tpl = 'Oi {{nome}}, seu pedido {{numero}} totalizou R$ {{total}}';
    const ctx = { nome: 'Maria', numero: '123', total: '450,00' };
    expect(renderString(tpl, ctx)).toBe('Oi Maria, seu pedido 123 totalizou R$ 450,00');
  });

  it('substitui placeholder repetido', () => {
    const tpl = '{{nome}} {{nome}} {{nome}}';
    expect(renderString(tpl, { nome: 'X' })).toBe('X X X');
  });

  it('placeholder ausente vira string vazia + warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(renderString('Olá {{nome}}!', {})).toBe('Olá !');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('{{nome}}'));
    warn.mockRestore();
  });

  it('placeholder null vira vazio', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(renderString('Olá {{nome}}!', { nome: null })).toBe('Olá !');
    warn.mockRestore();
  });

  it('preserva conteúdo sem placeholder', () => {
    expect(renderString('texto puro', {})).toBe('texto puro');
  });

  it('aceita number como valor', () => {
    expect(renderString('valor: {{n}}', { n: 42 })).toBe('valor: 42');
  });

  it('preserva quebra de linha e markdown', () => {
    const tpl = '**{{nome}}**\n\nVeja {{link}}';
    const out = renderString(tpl, { nome: 'Cliente', link: 'https://x' });
    expect(out).toBe('**Cliente**\n\nVeja https://x');
  });

  it('tolera espaços dentro dos delimitadores', () => {
    expect(renderString('{{ nome }} {{nome}}', { nome: 'Y' })).toBe('Y Y');
  });
});

describe('extrairPlaceholders', () => {
  it('retorna lista única de placeholders', () => {
    const tpl = '{{a}} {{b}} {{a}} {{c}}';
    expect(extrairPlaceholders(tpl).sort()).toEqual(['a', 'b', 'c']);
  });

  it('retorna vazio quando não há placeholder', () => {
    expect(extrairPlaceholders('texto puro')).toEqual([]);
  });
});
