import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

// ─── Period helpers ────────────────────────────────────────────────────────

function parseMes(param: string | undefined) {
  const now = new Date();
  const currentMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const mes = param && /^\d{4}-\d{2}$/.test(param) ? param : currentMes;
  const [y, m] = mes.split('-').map(Number) as [number, number];
  const startStr = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const endStr = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  const label = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return { mes, currentMes, startStr, endStr, label };
}

function prevMes(mes: string) {
  const [y, m] = mes.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMes(mes: string) {
  const [y, m] = mes.split('-').map(Number) as [number, number];
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Queries ───────────────────────────────────────────────────────────────

async function queryMetricas(startStr: string, endStr: string) {
  const rows = await db.execute<{
    faturamento: string;
    total_pedidos: number;
    clientes_unicos: number;
  }>(sql`
    SELECT
      COALESCE(SUM(total::numeric), 0)::text AS faturamento,
      COUNT(*)::int AS total_pedidos,
      COUNT(DISTINCT contato_id)::int AS clientes_unicos
    FROM pedidos
    WHERE situacao_valor = 9
      AND data >= ${startStr}::date
      AND data < ${endStr}::date
  `);
  const r = rows[0] ?? { faturamento: '0', total_pedidos: 0, clientes_unicos: 0 };
  const fat = Number(r.faturamento);
  const total = r.total_pedidos;
  return {
    faturamento: fat,
    totalPedidos: total,
    clientesUnicos: r.clientes_unicos,
    ticketMedio: total > 0 ? fat / total : 0,
  };
}

async function queryFunil() {
  const rows = await db.execute<{ coluna: string; total: number }>(sql`
    SELECT coluna, COUNT(*)::int AS total
    FROM cards
    GROUP BY coluna
    ORDER BY coluna
  `);
  const byColuna: Record<string, number> = {};
  for (const r of rows) byColuna[r.coluna] = r.total;
  return byColuna;
}

async function queryTopClientes(startStr: string, endStr: string) {
  return db.execute<{
    nome: string;
    total_compras: string;
    num_pedidos: number;
  }>(sql`
    SELECT
      c.nome,
      SUM(p.total::numeric)::text AS total_compras,
      COUNT(p.id)::int AS num_pedidos
    FROM pedidos p
    JOIN contatos c ON c.id = p.contato_id
    WHERE p.situacao_valor = 9
      AND p.data >= ${startStr}::date
      AND p.data < ${endStr}::date
    GROUP BY c.id, c.nome
    ORDER BY SUM(p.total::numeric) DESC
    LIMIT 10
  `);
}

async function queryTendencia() {
  return db.execute<{ mes: string; faturamento: string; pedidos: number }>(sql`
    SELECT
      TO_CHAR(DATE_TRUNC('month', data), 'YYYY-MM') AS mes,
      COALESCE(SUM(total::numeric), 0)::text AS faturamento,
      COUNT(*)::int AS pedidos
    FROM pedidos
    WHERE situacao_valor = 9
      AND data >= (DATE_TRUNC('month', NOW()) - INTERVAL '5 months')
    GROUP BY 1
    ORDER BY 1
  `);
}

// ─── Formatters ────────────────────────────────────────────────────────────

function brl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function mesAbrev(mesStr: string) {
  const [y, m] = mesStr.split('-').map(Number) as [number, number];
  return new Date(y, m - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '');
}

const COLUNA_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  em_contato: 'Em contato',
  finalizado: 'Finalizado',
  arquivo: 'Arquivo',
};

// ─── Sub-components (server) ───────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  muted,
}: {
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
}) {
  return (
    <div className={`rounded-md border bg-card p-4 ${muted ? 'opacity-55' : ''}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function MesNav({
  mes,
  label,
  isCurrentMonth,
}: {
  mes: string;
  label: string;
  isCurrentMonth: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <a
        href={`/dashboard?mes=${prevMes(mes)}`}
        className="px-2 py-1 text-sm border rounded hover:bg-accent"
      >
        ←
      </a>
      <span className="font-medium text-sm w-36 text-center capitalize">{label}</span>
      {isCurrentMonth ? (
        <span className="px-2 py-1 text-sm border rounded opacity-30 cursor-default select-none">
          →
        </span>
      ) : (
        <a
          href={`/dashboard?mes=${nextMes(mes)}`}
          className="px-2 py-1 text-sm border rounded hover:bg-accent"
        >
          →
        </a>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesParam } = await searchParams;
  const { mes, currentMes, startStr, endStr, label } = parseMes(mesParam);

  const [metricas, funil, topClientes, tendencia] = await Promise.all([
    queryMetricas(startStr, endStr),
    queryFunil(),
    queryTopClientes(startStr, endStr),
    queryTendencia(),
  ]);

  const maxFat = Math.max(...tendencia.map((t) => Number(t.faturamento)), 1);
  const totalAtivos =
    (funil['pendente'] ?? 0) + (funil['em_contato'] ?? 0) + (funil['finalizado'] ?? 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <MesNav mes={mes} label={label} isCurrentMonth={mes === currentMes} />
      </header>

      {/* Métricas do período */}
      <section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
          Pedidos atendidos — {label}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Faturamento" value={brl(metricas.faturamento)} />
          <MetricCard
            label="Ticket médio"
            value={brl(metricas.ticketMedio)}
            sub={`${metricas.totalPedidos} pedidos`}
          />
          <MetricCard label="Pedidos" value={String(metricas.totalPedidos)} />
          <MetricCard label="Clientes únicos" value={String(metricas.clientesUnicos)} />
        </div>
      </section>

      {/* Tendência 6 meses */}
      <section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
          Faturamento — últimos 6 meses
        </h2>
        <div className="rounded-md border bg-card p-4">
          {tendencia.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Sem histórico de pedidos. Execute o bootstrap para importar dados.
            </p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {tendencia.map((t) => {
                const fat = Number(t.faturamento);
                const barH = Math.max(6, Math.round((fat / maxFat) * 88));
                const isActive = t.mes === mes;
                return (
                  <a
                    key={t.mes}
                    href={`/dashboard?mes=${t.mes}`}
                    className="flex flex-col items-center gap-1 flex-1 h-full justify-end group"
                    title={`${mesAbrev(t.mes)}: ${brl(fat)} (${t.pedidos} pedidos)`}
                  >
                    <span className="text-xs text-muted-foreground text-center leading-tight hidden sm:block">
                      {brl(fat).replace('R$ ', '')}
                    </span>
                    <div
                      className={`w-full rounded-t transition-colors ${
                        isActive ? 'bg-primary' : 'bg-primary/25 group-hover:bg-primary/50'
                      }`}
                      style={{ height: `${barH}px` }}
                    />
                    <span className="text-xs text-muted-foreground capitalize">
                      {mesAbrev(t.mes)}
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Funil operacional */}
      <section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
          Funil — snapshot atual ({totalAtivos} ativos)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(['pendente', 'em_contato', 'finalizado', 'arquivo'] as const).map((col) => (
            <MetricCard
              key={col}
              label={COLUNA_LABEL[col] ?? col}
              value={String(funil[col] ?? 0)}
              muted={col === 'arquivo'}
            />
          ))}
        </div>
      </section>

      {/* Top clientes */}
      <section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
          Top clientes — {label}
        </h2>
        <div className="rounded-md border bg-card overflow-hidden">
          {topClientes.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              Sem pedidos atendidos no período.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2 font-medium w-8">#</th>
                  <th className="text-left px-4 py-2 font-medium">Cliente</th>
                  <th className="text-right px-4 py-2 font-medium">Pedidos</th>
                  <th className="text-right px-4 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {topClientes.map((c, i) => (
                  <tr key={`${c.nome}-${i}`} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{c.nome}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.num_pedidos}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {brl(Number(c.total_compras))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
