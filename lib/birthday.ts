import { sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { cards, contatos } from '@/db/schema';
import { proximoAniversario, nowBRT } from '@/lib/time';

// Cria card de aniversário em 'pausado' (ou 'pendente' se for o mais urgente).
// Idempotente: noop se já existe card ativo ou pausado de aniversário.
export async function upsertBirthdayCard(
  contatoId: number,
  dataAniversario: Date,
  nomeExibido: string,
  vendedorId: number | null,
): Promise<void> {
  const [existing] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(drizzleSql`contato_id = ${contatoId} AND tipo = 'aniversario' AND coluna != 'arquivo'`)
    .limit(1);
  if (existing) return;

  const proximo = proximoAniversario(dataAniversario, nowBRT());
  const nextDpa = proximo.toJSDate();

  // Verifica card ativo (qualquer coluna que não seja arquivo ou pausado)
  const [activeCard] = await db
    .select({ id: cards.id, dataPrevistaAcao: cards.dataPrevistaAcao, vendedorId: cards.vendedorId })
    .from(cards)
    .where(drizzleSql`contato_id = ${contatoId} AND coluna NOT IN ('arquivo', 'pausado')`)
    .limit(1);

  let birthdayColuna: 'pendente' | 'pausado' = activeCard ? 'pausado' : 'pendente';

  if (activeCard?.dataPrevistaAcao && nextDpa < activeCard.dataPrevistaAcao) {
    // Aniversário é mais urgente → card ativo vira pausado e aniversário fica ativo
    await db
      .update(cards)
      .set({ coluna: 'pausado', atualizadoEm: drizzleSql`now()` })
      .where(eq(cards.id, activeCard.id));
    birthdayColuna = 'pendente';
    vendedorId = vendedorId ?? activeCard.vendedorId;
  }

  try {
    await db.insert(cards).values({
      contatoId,
      tipo: 'aniversario',
      coluna: birthdayColuna,
      nomeExibido: `Aniversário · ${nomeExibido}`,
      dataPrevistaAcao: nextDpa,
      tentativasReativacao: 0,
      vendedorId,
    });
  } catch (err) {
    // 23505: race condition benigna — outro processo criou o card primeiro
    if ((err as { code?: string }).code !== '23505') throw err;
  }
}

// Ativa o card pausado com dataPrevistaAcao mais próxima do contato.
// Chamado quando qualquer card vai para 'arquivo'.
export async function activateNextPausado(contatoId: number): Promise<void> {
  const [next] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(drizzleSql`contato_id = ${contatoId} AND coluna = 'pausado'`)
    .orderBy(cards.dataPrevistaAcao)
    .limit(1);
  if (!next) return;
  await db
    .update(cards)
    .set({ coluna: 'pendente', colunaDeSde: drizzleSql`now()`, atualizadoEm: drizzleSql`now()` })
    .where(eq(cards.id, next.id));
}

// Renova card de aniversário para o próximo ano em 'pausado'.
// Chamado quando um card de aniversário é arquivado.
export async function renewBirthdayCard(
  contatoId: number,
  nomeExibido: string,
  vendedorId: number | null,
): Promise<void> {
  const [contato] = await db
    .select({ dataAniversario: contatos.dataAniversario })
    .from(contatos)
    .where(eq(contatos.id, contatoId))
    .limit(1);
  if (!contato?.dataAniversario) return;

  const proximo = proximoAniversario(contato.dataAniversario, nowBRT());
  try {
    await db.insert(cards).values({
      contatoId,
      tipo: 'aniversario',
      coluna: 'pausado',
      nomeExibido,
      dataPrevistaAcao: proximo.toJSDate(),
      tentativasReativacao: 0,
      vendedorId,
    });
  } catch (err) {
    if ((err as { code?: string }).code !== '23505') throw err;
  }
}
