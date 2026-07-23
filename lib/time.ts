import { DateTime, type DateTimeMaybeValid } from 'luxon';

export const TZ = 'America/Sao_Paulo' as const;

export function nowBRT(): DateTime<true> {
  return DateTime.now().setZone(TZ) as DateTime<true>;
}

export function toBRT(input: Date | string | DateTime): DateTime {
  if (input instanceof DateTime) return input.setZone(TZ);
  if (typeof input === 'string') {
    const fromISO = DateTime.fromISO(input, { zone: TZ });
    return fromISO.isValid ? fromISO : (DateTime.fromJSDate(new Date(input)).setZone(TZ) as DateTime);
  }
  return DateTime.fromJSDate(input).setZone(TZ);
}

export function addDays(input: Date | DateTime, n: number): DateTime {
  return toBRT(input).plus({ days: n });
}

export function addHours(input: Date | DateTime, n: number): DateTime {
  return toBRT(input).plus({ hours: n });
}

export function addMonths(input: Date | DateTime, n: number): DateTime {
  return toBRT(input).plus({ months: n });
}

export function formatBR(input: Date | DateTime, fmt = 'dd/MM/yyyy HH:mm'): string {
  const dt = toBRT(input);
  return dt.isValid ? dt.toFormat(fmt) : '';
}

export function formatDateBR(input: Date | DateTime): string {
  return formatBR(input, 'dd/MM/yyyy');
}

export function isPast(input: Date | DateTime, reference?: Date | DateTime): boolean {
  const dt = toBRT(input);
  const ref = reference ? toBRT(reference) : nowBRT();
  return dt < ref;
}

export function daysAgo(input: Date | DateTime, reference?: Date | DateTime): number {
  const dt = toBRT(input);
  const ref = reference ? toBRT(reference) : nowBRT();
  return Math.floor(ref.diff(dt, 'days').days);
}

export function daysUntil(input: Date | DateTime, reference?: Date | DateTime): number {
  const dt = toBRT(input);
  const ref = reference ? toBRT(reference) : nowBRT();
  return Math.ceil(dt.diff(ref, 'days').days);
}

export function hoursSince(input: Date | DateTime, reference?: Date | DateTime): number {
  const dt = toBRT(input);
  const ref = reference ? toBRT(reference) : nowBRT();
  return ref.diff(dt, 'hours').hours;
}

export function toJSDate(input: DateTime): Date {
  return input.toJSDate();
}

export function fromJSDate(input: Date): DateTime {
  return DateTime.fromJSDate(input).setZone(TZ) as DateTimeMaybeValid as DateTime;
}

// Calcula a próxima ocorrência de um mês/dia a partir de hoje (inclusive).
// Feb 29 em ano não-bissexto: Luxon faz overflow para Mar 1 automaticamente.
export function proximoAniversario(dataNasc: Date | DateTime, hoje?: DateTime): DateTime {
  const nasc =
    dataNasc instanceof DateTime
      ? (dataNasc.setZone(TZ) as DateTime)
      : (DateTime.fromJSDate(dataNasc).setZone(TZ) as DateTime);
  const ref = hoje ?? nowBRT();
  const esteAno = nasc.set({ year: ref.year });
  if (esteAno >= ref.startOf('day')) return esteAno;
  return nasc.set({ year: ref.year + 1 });
}
