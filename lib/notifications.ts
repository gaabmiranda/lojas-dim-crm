import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { notificacoes, usuarios, type NewNotificacao } from '@/db/schema';

export interface NotifyArgs {
  usuarioId: number;
  tipo: string;
  titulo: string;
  link?: string;
  /**
   * Se true, além da row em `notificacoes`, dispara WhatsApp via Chatwoot
   * pro telefone do usuário (se cadastrado).
   */
  alsoWhatsapp?: boolean;
}

export interface NotifyResult {
  notificacaoId: number;
  whatsappEnviado: boolean;
}

export async function notify(args: NotifyArgs): Promise<NotifyResult> {
  const row: NewNotificacao = {
    usuarioId: args.usuarioId,
    tipo: args.tipo,
    titulo: args.titulo,
    link: args.link,
  };
  const inserted = await db.insert(notificacoes).values(row).returning({ id: notificacoes.id });
  const notificacaoId = inserted[0]!.id;

  if (!args.alsoWhatsapp) {
    return { notificacaoId, whatsappEnviado: false };
  }

  const [usuario] = await db
    .select({ telefone: usuarios.telefone, nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.id, args.usuarioId))
    .limit(1);

  if (!usuario?.telefone) {
    return { notificacaoId, whatsappEnviado: false };
  }

  try {
    const { openOrCreateConversation } = await import('@/lib/chatwoot/client');
    await openOrCreateConversation({
      name: usuario.nome ?? 'Vendedor',
      phone: usuario.telefone,
      content: args.titulo,
    });
    return { notificacaoId, whatsappEnviado: true };
  } catch (err) {
    console.warn('[notify] falha ao enviar WhatsApp via Chatwoot:', err);
    return { notificacaoId, whatsappEnviado: false };
  }
}

export async function marcarComoLida(notificacaoId: number, usuarioId: number): Promise<void> {
  await db
    .update(notificacoes)
    .set({ lida: true })
    .where(eq(notificacoes.id, notificacaoId))
    .execute();
  // usuarioId aqui é defensivo — a verificação de ownership fica na rota API.
  void usuarioId;
}
