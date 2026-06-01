import { describe, expect, it } from 'vitest';
import { bigintLike, boolString, dateBR, phoneBR } from '@/lib/validators/shared';

describe('bigintLike', () => {
  it('aceita string numérica', () => {
    expect(bigintLike.parse('17592187232931')).toBe(17592187232931);
  });

  it('aceita number inteiro', () => {
    expect(bigintLike.parse(12345)).toBe(12345);
  });

  it('aceita bigint direto', () => {
    expect(bigintLike.parse(99n)).toBe(99);
  });

  it('rejeita string não-numérica', () => {
    expect(() => bigintLike.parse('abc')).toThrow();
  });

  it('rejeita float', () => {
    expect(() => bigintLike.parse(12.5)).toThrow();
  });
});

describe('dateBR', () => {
  it('aceita YYYY-MM-DD', () => {
    expect(dateBR.parse('2026-06-15')).toBe('2026-06-15');
  });

  it('aceita ISO completo', () => {
    const iso = '2026-06-15T10:30:00-03:00';
    expect(dateBR.parse(iso)).toBe(iso);
  });

  it('rejeita formato BR dd/MM/yyyy', () => {
    expect(() => dateBR.parse('15/06/2026')).toThrow();
  });

  it('rejeita lixo', () => {
    expect(() => dateBR.parse('not-a-date')).toThrow();
  });
});

describe('phoneBR', () => {
  it('mantém 11 dígitos', () => {
    expect(phoneBR.parse('38999998888')).toBe('38999998888');
  });

  it('aceita 10 dígitos (fixo)', () => {
    expect(phoneBR.parse('3833334444')).toBe('3833334444');
  });

  it('remove máscara', () => {
    expect(phoneBR.parse('(38) 99999-8888')).toBe('38999998888');
  });

  it('remove prefixo +55', () => {
    expect(phoneBR.parse('+5538999998888')).toBe('38999998888');
  });

  it('rejeita curto demais', () => {
    expect(() => phoneBR.parse('123')).toThrow();
  });
});

describe('boolString', () => {
  it('"true" → true', () => {
    expect(boolString.parse('true')).toBe(true);
  });

  it('"false" → false', () => {
    expect(boolString.parse('false')).toBe(false);
  });

  it('"1" → true', () => {
    expect(boolString.parse('1')).toBe(true);
  });

  it('"0" → false', () => {
    expect(boolString.parse('0')).toBe(false);
  });

  it('boolean direto passa', () => {
    expect(boolString.parse(true)).toBe(true);
  });
});
