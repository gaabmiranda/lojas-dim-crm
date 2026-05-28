// Types parciais da API REST do Chatwoot — apenas o que o CRM consome.

export interface ChatwootContact {
  id: number;
  name: string;
  email?: string;
  phone_number?: string;
  identifier?: string;
}

export interface ChatwootConversation {
  id: number;
  inbox_id: number;
  status: 'open' | 'resolved' | 'pending' | 'snoozed';
  contact_id?: number;
}

export interface ChatwootMessage {
  id: number;
  content: string;
  message_type: 'incoming' | 'outgoing' | 'activity' | 'template';
  conversation_id: number;
  created_at: number;
  sender?: {
    id: number;
    name: string;
    phone_number?: string;
    type: 'contact' | 'user';
  };
}

// Payload do webhook `message_created` (subset).
export interface ChatwootIncomingMessageWebhook {
  event: 'message_created';
  id: number;
  content: string;
  message_type: 'incoming' | 'outgoing' | 'activity' | 'template';
  conversation: {
    id: number;
    inbox_id: number;
    status: string;
  };
  sender: {
    id: number;
    name?: string;
    phone_number?: string;
    type?: string;
  };
  created_at: number;
  account?: { id: number };
  inbox?: { id: number };
}
