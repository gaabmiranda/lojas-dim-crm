import { describe, expect, it } from 'vitest';
import {
  addDays,
  addHours,
  addMonths,
  daysAgo,
  daysUntil,
  formatBR,
  formatDateBR,
  hoursSince,
  isPast,
  nowBRT,
  toBRT,
  TZ,
} from '@/lib/time';

describe('lib/time', () => {
  it('nowBRT retorna DateTime em America/Sao_Paulo', () => {
    const dt = nowBRT();
    expect(dt.zoneName).toBe(TZ);
    expect(dt.isValid).toBe(true);
  });

  it('toBRT converte Date pra BRT', () => {
    const utc = new Date('2026-06-15T15:00:00Z');
    const brt = toBRT(utc);
    expect(brt.zoneName).toBe(TZ);
    // Brasil hoje é UTC-3 sem horário de verão → 15:00 UTC = 12:00 BRT
    expect(brt.hour).toBe(12);
  });

  it('addDays soma corretamente em BRT', () => {
    const start = toBRT('2026-06-15T10:00:00-03:00');
    const plus14 = addDays(start, 14);
    expect(plus14.day).toBe(29);
    expect(plus14.month).toBe(6);
  });

  it('addHours soma horas mantendo TZ', () => {
    const start = toBRT('2026-06-15T22:00:00-03:00');
    const plus48 = addHours(start, 48);
    expect(plus48.day).toBe(17);
    expect(plus48.zoneName).toBe(TZ);
  });

  it('addMonths soma meses', () => {
    const start = toBRT('2026-06-15T10:00:00-03:00');
    const plus12 = addMonths(start, 12);
    expect(plus12.year).toBe(2027);
    expect(plus12.month).toBe(6);
  });

  it('formatBR usa formato dd/MM/yyyy HH:mm', () => {
    const dt = toBRT('2026-06-15T14:30:00-03:00');
    expect(formatBR(dt)).toBe('15/06/2026 14:30');
  });

  it('formatDateBR retorna apenas data', () => {
    const dt = toBRT('2026-06-15T14:30:00-03:00');
    expect(formatDateBR(dt)).toBe('15/06/2026');
  });

  it('isPast detecta datas no passado', () => {
    const ontem = addDays(nowBRT(), -1);
    const amanha = addDays(nowBRT(), 1);
    expect(isPast(ontem)).toBe(true);
    expect(isPast(amanha)).toBe(false);
  });

  it('daysAgo calcula diferença em dias positivos', () => {
    const ref = toBRT('2026-06-15T10:00:00-03:00');
    const tresDiasAtras = toBRT('2026-06-12T10:00:00-03:00');
    expect(daysAgo(tresDiasAtras, ref)).toBe(3);
  });

  it('daysUntil calcula diferença futura', () => {
    const ref = toBRT('2026-06-15T10:00:00-03:00');
    const daquiSete = toBRT('2026-06-22T10:00:00-03:00');
    expect(daysUntil(daquiSete, ref)).toBe(7);
  });

  it('hoursSince retorna fração de horas', () => {
    const ref = toBRT('2026-06-15T10:00:00-03:00');
    const halfHourAgo = toBRT('2026-06-15T09:30:00-03:00');
    expect(hoursSince(halfHourAgo, ref)).toBe(0.5);
  });

  it('round-trip toBRT preserva instante', () => {
    const original = new Date('2026-06-15T15:00:00Z');
    const brt = toBRT(original);
    expect(brt.toJSDate().getTime()).toBe(original.getTime());
  });
});
