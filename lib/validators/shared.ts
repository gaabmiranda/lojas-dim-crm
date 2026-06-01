import { z } from 'zod';

// Bling envia IDs como number ou string dependendo do endpoint. Aceitamos ambos e convertemos pra number.
export const bigintLike = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((v, ctx) => {
    try {
      if (typeof v === 'bigint') return Number(v);
      if (typeof v === 'number') {
        if (!Number.isFinite(v) || !Number.isInteger(v)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'esperado inteiro',
          });
          return z.NEVER;
        }
        return v;
      }
      const trimmed = v.trim();
      if (!/^-?\d+$/.test(trimmed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'string não-numérica',
        });
        return z.NEVER;
      }
      return Number(trimmed);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'falha ao converter em number',
      });
      return z.NEVER;
    }
  });

// Data no formato Bling: "YYYY-MM-DD" (date) ou ISO completo.
export const dateBR = z.string().refine(
  (v) => {
    const ymd = /^\d{4}-\d{2}-\d{2}/;
    return ymd.test(v) && !Number.isNaN(Date.parse(v));
  },
  { message: 'data deve ser YYYY-MM-DD ou ISO' },
);

// Telefone BR — aceita apenas dígitos (10 ou 11), opcionalmente com +55 e máscaras.
// Retorna apenas dígitos.
export const phoneBR = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length >= 10 && v.length <= 13, {
    message: 'telefone deve ter 10-13 dígitos',
  })
  .transform((v) => {
    // Normaliza: remove +55 prefix se presente (mantém DDD + número).
    if (v.length === 13 && v.startsWith('55')) return v.slice(2);
    if (v.length === 12 && v.startsWith('55')) return v.slice(2);
    return v;
  });

// Boolean string ("true"/"false"/"1"/"0").
export const boolString = z
  .union([z.string(), z.boolean()])
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    const lower = v.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes';
  });
