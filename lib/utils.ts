import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Exhaustiveness check em switch/case.
export function assertNever(value: never): never {
  throw new Error(`Caso não tratado: ${JSON.stringify(value)}`);
}

// Converte "1.234,56" (formato BR) em number. Retorna NaN se inválido.
export function parseNumberBR(input: string | number | null | undefined): number {
  if (input == null || input === '') return NaN;
  if (typeof input === 'number') return input;
  const normalized = input.replace(/\./g, '').replace(',', '.').trim();
  return Number(normalized);
}

// Formata number como "1.234,56".
export function formatNumberBR(value: number, fractionDigits = 2): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatCurrencyBR(value: number): string {
  return `R$ ${formatNumberBR(value)}`;
}
