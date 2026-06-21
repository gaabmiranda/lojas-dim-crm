import { asc, and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { cards, vendedoresBling, type ColunaCard, type TipoCard, tipoCardEnum } from '@/db/schema';
import { KanbanBoard, type KanbanCardData } from './KanbanBoard';

const COLUNAS: { id: ColunaCard; titulo: string }[] = [
  { id: 'pendente', titulo: 'Pendente' },
  { id: 'em_contato', titulo: 'Em contato' },
  { id: 'finalizado', titulo: 'Finalizado' },
];

const PER_COLUMN = 200;

async function carregarColuna(
  col: ColunaCard,
  filtros: { vendedorId?: number; tipo?: TipoCard },
): Promise<KanbanCardData[]> {
  const where = [eq(cards.coluna, col)];
  if (filtros.vendedorId) where.push(eq(cards.vendedorId, filtros.vendedorId));
  if (filtros.tipo) where.push(eq(cards.tipo, filtros.tipo));

  const rows = await db.query.cards.findMany({
    where: and(...where),
    with: { contato: true, pedidoOrigem: true, vendedor: true },
    orderBy: [asc(cards.dataPrevistaAcao)],
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
    colunaDeSde: c.colunaDeSde.toISOString(),
    vendedorId: c.vendedorId,
    vendedorNome: c.vendedor?.contatoNome ?? null,
  }));
}

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const vendedorIdParam = params.vendedor_id ? Number(params.vendedor_id) : undefined;
  const tipoParam =
    typeof params.tipo === 'string' &&
    (tipoCardEnum.enumValues as readonly string[]).includes(params.tipo)
      ? (params.tipo as TipoCard)
      : undefined;

  const filtros = { vendedorId: vendedorIdParam, tipo: tipoParam };

  const [colunasComCards, vendedores] = await Promise.all([
    Promise.all(
      COLUNAS.map(async (c) => ({ ...c, items: await carregarColuna(c.id, filtros) })),
    ),
    db.select({ id: vendedoresBling.id, nome: vendedoresBling.contatoNome })
      .from(vendedoresBling)
      .orderBy(asc(vendedoresBling.contatoNome)),
  ]);

  return (
    <div className="p-6">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Pipeline pós-venda</h1>
        <p className="text-sm text-muted-foreground">
          {colunasComCards.reduce((a, c) => a + c.items.length, 0)} cards ativos
        </p>
      </header>
      <KanbanBoard
        key={`${vendedorIdParam ?? 0}-${tipoParam ?? ''}`}
        colunas={colunasComCards}
        vendedores={vendedores}
        filtros={{ vendedorId: vendedorIdParam ?? null, tipo: tipoParam ?? null }}
      />
    </div>
  );
}
