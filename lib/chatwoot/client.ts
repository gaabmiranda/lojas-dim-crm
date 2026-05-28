import type { ChatwootContact, ChatwootConversation, ChatwootMessage } from './types';

interface Env {
  baseUrl: string;
  apiToken: string;
  accountId: string;
  inboxId: string;
}

function env(): Env {
  const baseUrl = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '');
  const apiToken = process.env.CHATWOOT_API_TOKEN;
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  const inboxId = process.env.CHATWOOT_INBOX_ID;
  if (!baseUrl || !apiToken || !accountId || !inboxId) {
    throw new Error(
      'Chatwoot não configurado: CHATWOOT_BASE_URL, CHATWOOT_API_TOKEN, CHATWOOT_ACCOUNT_ID, CHATWOOT_INBOX_ID são obrigatórios.',
    );
  }
  return { baseUrl, apiToken, accountId, inboxId };
}

async function chatwootFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, apiToken } = env();
  const resp = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      api_access_token: apiToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Chatwoot ${resp.status} em ${path}: ${text.slice(0, 200)}`);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

// Normaliza telefone pra formato +55XXXXXXXXXXX (Chatwoot Baileys precisa do +55).
function normalizePhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55')) return `+${digits}`;
  return `+55${digits}`;
}

export async function searchContact(phone: string): Promise<ChatwootContact | null> {
  const { accountId } = env();
  const e164 = normalizePhoneE164(phone);
  type Resp = { payload: ChatwootContact[]; meta?: unknown };
  const resp = await chatwootFetch<Resp>(
    `/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(e164)}`,
  );
  return resp.payload?.[0] ?? null;
}

export async function createContact(args: { name: string; phone: string; email?: string }): Promise<ChatwootContact> {
  const { accountId, inboxId } = env();
  const e164 = normalizePhoneE164(args.phone);
  type Resp = { payload: { contact: ChatwootContact } };
  const resp = await chatwootFetch<Resp>(`/api/v1/accounts/${accountId}/contacts`, {
    method: 'POST',
    body: JSON.stringify({
      inbox_id: Number(inboxId),
      name: args.name,
      phone_number: e164,
      email: args.email,
    }),
  });
  return resp.payload.contact;
}

export async function createConversation(args: {
  contactId: number;
  initialMessage?: string;
}): Promise<ChatwootConversation> {
  const { accountId, inboxId } = env();
  const body: Record<string, unknown> = {
    contact_id: args.contactId,
    inbox_id: Number(inboxId),
    status: 'open',
  };
  if (args.initialMessage) {
    body.message = { content: args.initialMessage };
  }
  return await chatwootFetch<ChatwootConversation>(
    `/api/v1/accounts/${accountId}/conversations`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export async function sendMessage(args: {
  conversationId: number;
  content: string;
}): Promise<ChatwootMessage> {
  const { accountId } = env();
  return await chatwootFetch<ChatwootMessage>(
    `/api/v1/accounts/${accountId}/conversations/${args.conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        content: args.content,
        message_type: 'outgoing',
      }),
    },
  );
}

export interface OpenOrCreateResult {
  conversationId: number;
  contactId: number;
  created: boolean;
}

export async function openOrCreateConversation(args: {
  name: string;
  phone: string;
  content: string;
}): Promise<OpenOrCreateResult> {
  let contact = await searchContact(args.phone);
  let created = false;
  if (!contact) {
    contact = await createContact({ name: args.name, phone: args.phone });
    created = true;
  }
  const conversation = await createConversation({
    contactId: contact.id,
    initialMessage: args.content,
  });
  return { conversationId: conversation.id, contactId: contact.id, created };
}
