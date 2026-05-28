import { z } from 'zod';

export const chatwootIncomingMessageSchema = z
  .object({
    event: z.string(),
    id: z.number(),
    content: z.string().optional().default(''),
    message_type: z.enum(['incoming', 'outgoing', 'activity', 'template']),
    conversation: z
      .object({
        id: z.number(),
        inbox_id: z.number().optional(),
        status: z.string().optional(),
      })
      .passthrough(),
    sender: z
      .object({
        id: z.number(),
        name: z.string().optional(),
        phone_number: z.string().optional(),
        type: z.string().optional(),
      })
      .passthrough()
      .optional(),
    created_at: z.number().optional(),
    inbox: z.object({ id: z.number() }).passthrough().optional(),
  })
  .passthrough();

export type ChatwootWebhookPayload = z.infer<typeof chatwootIncomingMessageSchema>;
