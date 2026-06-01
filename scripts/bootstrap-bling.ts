/**
 * Bootstrap inicial: lê ndjson exportados pelo bling_sync.ps1 (ver memory/reference-bling-arquivos)
 * e importa pra Postgres. NÃO chama API Bling — evita 27.851 chamadas.
 *
 * Uso: `npm run bootstrap:bling`
 * Env: BOOTSTRAP_NDJSON_DIR (default: C:/Users/GabrielM Pc/Documents/)
 *
 * Critério de aceite (AC10/AC11):
 *   select count(*) from contatos ≈ 4113
 *   select count(*) from pedidos ≈ 27851
 *
 * Versão 2 — otimizada para DB remoto:
 *   - Carrega IDs existentes em memória (1 query)
 *   - Batch inserts (500 contatos / 100 pedidos / 500 itens por query)
 *   - ~600 queries no total vs 112k+ na v1
 */
import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '../db/client';
import { contatos, pedidos, pedidoItens } from '../db/schema';
import { mapContato, mapPedido } from '../lib/bling/mapper';
import type { BlingContato, BlingPedidoVenda } from '../lib/bling/types';

const BATCH_CONTATOS = 500;
const BATCH_PEDIDOS = 100;
const BATCH_ITENS = 500;
const PROGRESS_EVERY = 2000;

const NDJSON_DIR =
  process.env.BOOTSTRAP_NDJSON_DIR?.trim() || 'C:/Users/GabrielM Pc/Documents';

async function streamLines<T>(path: string, parse: (line: string) => T): Promise<T[]> {
  const rows: T[] = [];
  const rl = createInterface({
    input: createReadStream(path, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });
  let n = 0;
  for await (const line of rl) {
    n++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(parse(trimmed));
      if (n % PROGRESS_EVERY === 0) process.stdout.write(`  lidos: ${n}\r`);
    } catch {
      // linha inválida — ignora
    }
  }
  console.log(`  lidos: ${n} linhas total`);
  return rows;
}

async function chunkInsert<T>(
  label: string,
  items: T[],
  batchSize: number,
  fn: (batch: T[]) => Promise<void>,
) {
  let done = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    await fn(items.slice(i, i + batchSize));
    done += Math.min(batchSize, items.length - i);
    process.stdout.write(`  ${label}: ${done}/${items.length}\r`);
  }
  console.log(`  ${label}: ${done}/${items.length} ✓`);
}

async function main() {
  console.log('Bootstrap Bling → Postgres (v2 — modo batch)');
  console.log(`Diretório NDJSON: ${NDJSON_DIR}`);

  // ── 1. Identificar arquivos disponíveis ───────────────────────────────────
  const contatosPath =
    existsSync(resolve(NDJSON_DIR, 'bling_contatos_full.ndjson'))
      ? resolve(NDJSON_DIR, 'bling_contatos_full.ndjson')
      : existsSync(resolve(NDJSON_DIR, 'bling_contatos.ndjson'))
        ? resolve(NDJSON_DIR, 'bling_contatos.ndjson')
        : null;

  const pedidosPath =
    existsSync(resolve(NDJSON_DIR, 'bling_pedidos_full.ndjson'))
      ? resolve(NDJSON_DIR, 'bling_pedidos_full.ndjson')
      : existsSync(resolve(NDJSON_DIR, 'bling_pedidos_list.ndjson'))
        ? resolve(NDJSON_DIR, 'bling_pedidos_list.ndjson')
        : null;

  if (!pedidosPath) {
    console.error('! Nenhum ndjson de pedidos encontrado. Rode primeiro bling_sync.ps1.');
    process.exit(1);
  }

  console.log(`Contatos: ${contatosPath ?? '(nenhum — stubs via pedidos)'}`);
  console.log(`Pedidos:  ${pedidosPath}`);

  // ── 2. Carregar IDs existentes em memória (evita lookups individuais) ─────
  console.log('\n[1/5] Carregando IDs existentes…');
  const existingRows = await db.select({ id: contatos.id, idBling: contatos.idBling }).from(contatos);
  const contatoMap = new Map<number, number>(existingRows.map((r) => [r.idBling, r.id]));
  console.log(`  ${contatoMap.size} contatos já no banco.`);

  // ── 3. Importar contatos completos (se arquivo existe) ────────────────────
  if (contatosPath) {
    console.log('\n[2/5] Lendo contatos…');
    const rawContatos = await streamLines(contatosPath, (l) => JSON.parse(l) as BlingContato);
    const novosContatos = rawContatos.filter((c) => !contatoMap.has(Number(c.id)));
    console.log(`  ${rawContatos.length} lidos, ${novosContatos.length} novos`);

    await chunkInsert('contatos', novosContatos, BATCH_CONTATOS, async (batch) => {
      const mapped = batch.map(mapContato);
      await db
        .insert(contatos)
        .values(mapped)
        .onConflictDoUpdate({
          target: contatos.idBling,
          set: {
            nome: drizzleSql`excluded.nome`,
            telefone: drizzleSql`excluded.telefone`,
            email: drizzleSql`excluded.email`,
            situacaoBling: drizzleSql`excluded.situacao_bling`,
            dadosExtrasJson: drizzleSql`excluded.dados_extras_json`,
            atualizadoEm: drizzleSql`now()`,
          },
        });
    });

    // Recarregar mapa com os novos IDs
    const updated = await db.select({ id: contatos.id, idBling: contatos.idBling }).from(contatos);
    for (const r of updated) contatoMap.set(r.idBling, r.id);
    console.log(`  mapa atualizado: ${contatoMap.size} contatos`);
  } else {
    console.log('\n[2/5] Sem arquivo de contatos — stubs serão criados via pedidos.');
  }

  // ── 4. Ler todos os pedidos em memória ────────────────────────────────────
  console.log('\n[3/5] Lendo pedidos…');
  const rawPedidos = await streamLines(pedidosPath, (l) => JSON.parse(l) as BlingPedidoVenda);
  console.log(`  ${rawPedidos.length} pedidos lidos.`);

  // ── 5. Criar stubs de contatos faltantes (batch único) ───────────────────
  console.log('\n[4/5] Verificando contatos faltantes…');
  const contatosFaltantes: BlingContato[] = [];
  for (const p of rawPedidos) {
    const idBling = Number(p.contato.id);
    if (!contatoMap.has(idBling)) {
      contatosFaltantes.push({ id: p.contato.id, nome: p.contato.nome ?? 'Cliente sem nome', situacao: 'A' });
      contatoMap.set(idBling, -1); // placeholder para evitar duplicata no loop
    }
  }
  console.log(`  ${contatosFaltantes.length} stubs a criar.`);

  if (contatosFaltantes.length > 0) {
    // Deduplica (mesmo contato em múltiplos pedidos)
    const dedup = Array.from(new Map(contatosFaltantes.map((c) => [c.id, c])).values());
    await chunkInsert('stubs', dedup, BATCH_CONTATOS, async (batch) => {
      const mapped = batch.map(mapContato);
      const inserted = await db
        .insert(contatos)
        .values(mapped)
        .onConflictDoUpdate({
          target: contatos.idBling,
          set: { atualizadoEm: drizzleSql`now()` },
        })
        .returning({ id: contatos.id, idBling: contatos.idBling });
      for (const r of inserted) contatoMap.set(r.idBling, r.id);
    });

    // Garantir que mapa está completo
    const refreshed = await db.select({ id: contatos.id, idBling: contatos.idBling }).from(contatos);
    for (const r of refreshed) contatoMap.set(r.idBling, r.id);
  }

  // ── 6. Inserir pedidos + itens em batch ───────────────────────────────────
  console.log('\n[5/5] Inserindo pedidos e itens…');
  const allItens: Array<{
    pedidoIdBling: number;
    descricao: string;
    quantidade: string | null;
    valorUnitario: string | null;
    valorTotal: string | null;
  }> = [];

  // Mapeia idBling do pedido → id interno (preenchido após insert)
  const pedidoIdMap = new Map<number, number>();

  await chunkInsert('pedidos', rawPedidos, BATCH_PEDIDOS, async (batch) => {
    const mappedPedidos: typeof pedidos.$inferInsert[] = [];
    const itensBatch: typeof allItens[number][] = [];

    for (const p of batch) {
      const contatoId = contatoMap.get(Number(p.contato.id));
      if (!contatoId || contatoId === -1) continue; // não deveria acontecer após passo 4
      const { pedido, itens } = mapPedido(p, contatoId);
      mappedPedidos.push(pedido);
      for (const item of itens) {
        itensBatch.push({
          pedidoIdBling: pedido.idBling!,
          descricao: item.descricao,
          quantidade: item.quantidade ?? null,
          valorUnitario: item.valorUnitario ?? null,
          valorTotal: item.valorTotal ?? null,
        });
      }
    }

    if (mappedPedidos.length === 0) return;

    const inserted = await db
      .insert(pedidos)
      .values(mappedPedidos)
      .onConflictDoUpdate({
        target: pedidos.idBling,
        set: {
          contatoId: drizzleSql`excluded.contato_id`,
          numero: drizzleSql`excluded.numero`,
          data: drizzleSql`excluded.data`,
          dataSaida: drizzleSql`excluded.data_saida`,
          situacaoId: drizzleSql`excluded.situacao_id`,
          situacaoValor: drizzleSql`excluded.situacao_valor`,
          total: drizzleSql`excluded.total`,
          totalProdutos: drizzleSql`excluded.total_produtos`,
          dadosCompletosJson: drizzleSql`excluded.dados_completos_json`,
          atualizadoEm: drizzleSql`now()`,
        },
      })
      .returning({ id: pedidos.id, idBling: pedidos.idBling });

    for (const r of inserted) pedidoIdMap.set(r.idBling!, r.id);

    // Acumula itens com o ID interno do pedido
    for (const item of itensBatch) {
      const pedidoId = pedidoIdMap.get(item.pedidoIdBling);
      if (pedidoId) {
        allItens.push({ ...item, pedidoIdBling: pedidoId }); // reutiliza campo como pedidoId interno
      }
    }
  });

  // Inserir todos os itens em batch
  const itensParaInserir = allItens.map((i) => ({
    pedidoId: i.pedidoIdBling, // aqui já é o ID interno
    descricao: i.descricao,
    quantidade: i.quantidade,
    valorUnitario: i.valorUnitario,
    valorTotal: i.valorTotal,
  }));

  if (itensParaInserir.length > 0) {
    await chunkInsert('itens', itensParaInserir, BATCH_ITENS, async (batch) => {
      await db.insert(pedidoItens).values(batch).onConflictDoNothing();
    });
  }

  // ── Resumo final ──────────────────────────────────────────────────────────
  const nContatos = (await db.select({ n: drizzleSql<number>`count(*)::int` }).from(contatos))[0]?.n ?? 0;
  const nPedidos = (await db.select({ n: drizzleSql<number>`count(*)::int` }).from(pedidos))[0]?.n ?? 0;
  const nItens = (await db.select({ n: drizzleSql<number>`count(*)::int` }).from(pedidoItens))[0]?.n ?? 0;

  console.log('\n✓ Bootstrap concluído.');
  console.log(`  contatos:     ${nContatos}`);
  console.log(`  pedidos:      ${nPedidos}`);
  console.log(`  pedido_itens: ${nItens}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Bootstrap falhou:', err);
    process.exit(1);
  });
