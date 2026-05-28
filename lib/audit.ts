import { db } from '@/db/client';
import { eventos, type NewEvento } from '@/db/schema';

export type EventoOrigem =
  | 'bling_webhook'
  | 'chatwoot_webhook'
  | 'n8n_cron'
  | 'api_interna'
  | 'bootstrap';

export interface LogEventArgs {
  tipo: string;
  origem: EventoOrigem;
  externalId?: string;
  cardId?: number;
  contatoId?: number;
  payload?: unknown;
}

export interface LogEventResult {
  inserted: boolean;
  duplicate: boolean;
  id?: number;
}

// Constraint unique (origem, external_id) WHERE external_id IS NOT NULL.
// Quando duplicate cai aqui, NÃO é exception — retornamos { duplicate: true } pro caller seguir.
export async function logEvent(args: LogEventArgs): Promise<LogEventResult> {
  const row: NewEvento = {
    tipo: args.tipo,
    origem: args.origem,
    externalId: args.externalId,
    cardId: args.cardId,
    contatoId: args.contatoId,
    payloadJson: args.payload as Record<string, unknown> | undefined,
  };

  try {
    const inserted = await db
      .insert(eventos)
      .values(row)
      .onConflictDoNothing({ target: [eventos.origem, eventos.externalId] })
      .returning({ id: eventos.id });

    if (inserted.length === 0) {
      return { inserted: false, duplicate: true };
    }
    return { inserted: true, duplicate: false, id: inserted[0]!.id };
  } catch (err) {
    // Postgres error code 23505 = unique_violation. Defensive: também tratamos.
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    ) {
      return { inserted: false, duplicate: true };
    }
    throw err;
  }
}
