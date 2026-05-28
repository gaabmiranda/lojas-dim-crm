import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { templatesMensagem } from '@/db/schema';

export type TemplateKey =
  | 'pos_venda_d14'
  | 'reativacao_1'
  | 'reativacao_2'
  | 'reativacao_3'
  | (string & {});

export type TemplateContext = Record<string, string | number | undefined | null>;

const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

// Substitui placeholders puro — não bate DB. Útil pra render server-side com conteúdo já lido.
export function renderString(conteudo: string, context: TemplateContext): string {
  return conteudo.replace(PLACEHOLDER_REGEX, (_match, key: string) => {
    const value = context[key];
    if (value == null || value === '') {
      console.warn(`[templates] placeholder {{${key}}} sem valor.`);
      return '';
    }
    return String(value);
  });
}

// Lê template do DB e renderiza. Lança se template não existe (intencional — preserva erro alto).
export async function renderTemplate(key: TemplateKey, context: TemplateContext): Promise<string> {
  const [row] = await db
    .select({ conteudo: templatesMensagem.conteudo })
    .from(templatesMensagem)
    .where(eq(templatesMensagem.key, key))
    .limit(1);
  if (!row) {
    throw new Error(`Template '${key}' não encontrado em templates_mensagem.`);
  }
  return renderString(row.conteudo, context);
}

// Lista placeholders num conteúdo — usado pela tela de Config pra preview/validação.
export function extrairPlaceholders(conteudo: string): string[] {
  const found = new Set<string>();
  for (const match of conteudo.matchAll(PLACEHOLDER_REGEX)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}
