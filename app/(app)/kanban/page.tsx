import { desc, and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { cards, type ColunaCard } from '@/db/schema';
import { KanbanBoard, type KanbanCardData } from './KanbanBoard';

const COLUNAS: { id: ColunaCard; titulo: string }[] = [
  { id: 'pendente', titulo: 'Pendente' },
  { id: 'em_contato', titulo: 'Em contato' },
  { id: 'finalizado', titulo: 'Finalizado' },
];

const PER_COLUMN = 50;

async function carregarColuna(col: ColunaCard): Promise<KanbanCardData[]> {
  const rows = await db.query.cards.findMany({
    where: and(eq(cards.coluna, col)),
    with: { contato: true, pedidoOrigem: true },
    orderBy: [desc(cards.criadoEm)],
    limit: PER_COLUMN,
  });
  return rows.map((c) => ({
    id: c.id,
    contatoNome: c.contato?.nome ?? c.nomeExibido,
    nomeExibido: c.nomeExibido,
    tipo: c.tipo,
    coluna: c.coluna,
    valorPedido: c.pedidoOrigem?.total ?? null,
    dataPrevistaAcao: c.dataPrevistaAcao?.toISOString() ?? null,
    tentativasReativacao: c.tentativasReativacao,
  }));
}

export default async function KanbanPage() {
  const colunasComCards = await Promise.all(
    COLUNAS.map(async (c) => ({ ...c, items: await carregarColuna(c.id) })),
  );

  return (
    <div className="p-6">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Pipeline pós-venda</h1>
        <p className="text-sm text-muted-foreground">
          {colunasComCards.reduce((a, c) => a + c.items.length, 0)} cards ativos
        </p>
      </header>
      <KanbanBoard colunas={colunasComCards} />
    </div>
  );
}
