import { z } from 'zod';
import { bigintLike } from './shared';

// Spec: payload exato a confirmar na primeira execução real.
// Iniciamos com schema permissivo (passthrough) e endurecemos depois.
export const blingWebhookSchema = z
  .object({
    evento: z.string(),
    versao: z.string().optional(),
    dados: z
      .object({
        id: bigintLike.optional(),
      })
      .passthrough(),
    data: z.string().optional(),
  })
  .passthrough();

export type BlingWebhookPayload = z.infer<typeof blingWebhookSchema>;

// Eventos relevantes pro CRM.
export const EVENTOS_PEDIDOS = [
  'pedido_venda.criado',
  'pedido_venda.alterado',
  'pedido_venda.excluido',
] as const;

export const EVENTOS_CONTATOS = ['contato.criado', 'contato.alterado'] as const;
