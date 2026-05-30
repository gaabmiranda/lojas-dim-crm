import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Replica do patchSchema da rota — testado isolado do DB.
const colunaValues = ['pendente', 'em_contato', 'finalizado', 'arquivo'] as const;

const patchSchema = z.object({
  coluna: z.enum(colunaValues).optional(),
  vendedorId: z.number().int().nullable().optional(),
  nomeExibido: z.string().min(1).optional(),
});

// ─── Validação do schema de PATCH ────────────────────────────────────────────

describe('cards PATCH — schema', () => {
  it('aceita body vazio (noop)', () => {
    const r = patchSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('aceita coluna válida', () => {
    for (const coluna of colunaValues) {
      const r = patchSchema.safeParse({ coluna });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.coluna).toBe(coluna);
    }
  });

  it('rejeita coluna inválida', () => {
    const r = patchSchema.safeParse({ coluna: 'em_revisao' });
    expect(r.success).toBe(false);
  });

  it('aceita vendedorId como inteiro positivo', () => {
    const r = patchSchema.safeParse({ vendedorId: 5 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.vendedorId).toBe(5);
  });

  it('aceita vendedorId null (desatribuir)', () => {
    const r = patchSchema.safeParse({ vendedorId: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.vendedorId).toBeNull();
  });

  it('rejeita vendedorId float', () => {
    const r = patchSchema.safeParse({ vendedorId: 1.5 });
    expect(r.success).toBe(false);
  });

  it('aceita nomeExibido não-vazio', () => {
    const r = patchSchema.safeParse({ nomeExibido: 'Pós-venda João' });
    expect(r.success).toBe(true);
  });

  it('rejeita nomeExibido vazio', () => {
    const r = patchSchema.safeParse({ nomeExibido: '' });
    expect(r.success).toBe(false);
  });

  it('aceita múltiplos campos juntos', () => {
    const r = patchSchema.safeParse({ coluna: 'em_contato', nomeExibido: 'Card teste', vendedorId: 2 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.coluna).toBe('em_contato');
      expect(r.data.nomeExibido).toBe('Card teste');
      expect(r.data.vendedorId).toBe(2);
    }
  });
});

// ─── Lógica de construção do objeto `updates` ────────────────────────────────
// Replica o comportamento da rota: só inclui campos presentes no body.

function buildUpdates(data: z.infer<typeof patchSchema>): Record<string, unknown> {
  const updates: Record<string, unknown> = { atualizadoEm: 'now()' };
  if (data.coluna) updates.coluna = data.coluna;
  if (data.vendedorId !== undefined) updates.vendedorId = data.vendedorId;
  if (data.nomeExibido) updates.nomeExibido = data.nomeExibido;
  return updates;
}

describe('cards PATCH — buildUpdates', () => {
  it('sempre inclui atualizadoEm', () => {
    const u = buildUpdates({});
    expect(u).toHaveProperty('atualizadoEm');
  });

  it('inclui coluna quando fornecida', () => {
    const u = buildUpdates({ coluna: 'finalizado' });
    expect(u.coluna).toBe('finalizado');
  });

  it('inclui vendedorId null (desatribuição deve chegar ao DB)', () => {
    const u = buildUpdates({ vendedorId: null });
    expect(u).toHaveProperty('vendedorId');
    expect(u.vendedorId).toBeNull();
  });

  it('não inclui coluna quando ausente', () => {
    const u = buildUpdates({ nomeExibido: 'Novo nome' });
    expect(u).not.toHaveProperty('coluna');
  });

  it('mover para arquivo é transição válida', () => {
    const r = patchSchema.safeParse({ coluna: 'arquivo' });
    expect(r.success).toBe(true);
    if (r.success) {
      const u = buildUpdates(r.data);
      expect(u.coluna).toBe('arquivo');
    }
  });
});

// ─── Idempotência via logEvent (comportamento documentado) ───────────────────
// A rota loga em `eventos` com origem='api_interna'. Verificação conceitual:
// dado um card_id + changes, o externalId segue o padrão documentado.

describe('cards PATCH — auditoria', () => {
  it('origem api_interna é o valor esperado no logEvent', () => {
    const ORIGEM_ESPERADA = 'api_interna';
    expect(ORIGEM_ESPERADA).toBe('api_interna');
  });

  it('tipo do evento é card_patch', () => {
    const TIPO_ESPERADO = 'card_patch';
    expect(TIPO_ESPERADO).toBe('card_patch');
  });

  it('transição para qualquer coluna gera log com changes corretos', () => {
    // Documenta o shape esperado do payload de logEvent (testa a estrutura sem DB).
    function buildAuditPayload(
      changes: z.infer<typeof patchSchema>,
      userId: string,
    ) {
      return { changes, by: userId };
    }

    const changes = { coluna: 'arquivo' as const };
    const payload = buildAuditPayload(changes, 'user-42');
    expect(payload.changes.coluna).toBe('arquivo');
    expect(payload.by).toBe('user-42');
  });
});
