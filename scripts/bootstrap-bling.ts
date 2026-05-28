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
 */
import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '../db/client';
import { contatos, pedidos, pedidoItens } from '../db/schema';
import { mapContato, mapPedido } from '../lib/bling/mapper';
import type { BlingContato, BlingPedidoVenda } from '../lib/bling/types';

const BATCH_SIZE = 500;
const PROGRESS_EVERY = 1000;

const NDJSON_DIR =
  process.env.BOOTSTRAP_NDJSON_DIR?.trim() || 'C:/Users/GabrielM Pc/Documents';

async function streamLines(path: string, onLine: (line: string, n: number) => Promise<void>) {
  const rl = createInterface({
    input: createReadStream(path, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });
  let n = 0;
  for await (const line of rl) {
    n++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    await onLine(trimmed, n);
  }
}

async function upsertContatosBatch(rows: BlingContato[]): Promise<void> {
  if (rows.length === 0) return;
  const mapped = rows.map(mapContato);
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
}

async function lookupContatoIdByBling(idBling: bigint): Promise<number | null> {
  const rows = await db
    .select({ id: contatos.id })
    .from(contatos)
    .where(drizzleSql`id_bling = ${idBling}`)
    .limit(1);
  return rows[0]?.id ?? null;
}

async function upsertPedidoComItens(p: BlingPedidoVenda): Promise<void> {
  const contatoIdBling = BigInt(p.contato.id);
  let contatoIdInterno = await lookupContatoIdByBling(contatoIdBling);

  if (contatoIdInterno == null) {
    // Contato ainda não existe → cria stub mínimo. Os ndjson de contatos completos virão depois.
    const stubContato: BlingContato = {
      id: p.contato.id,
      nome: p.contato.nome ?? 'Cliente sem nome',
      situacao: 'A',
    };
    const inserted = await db
      .insert(contatos)
      .values(mapContato(stubContato))
      .onConflictDoUpdate({
        target: contatos.idBling,
        set: { atualizadoEm: drizzleSql`now()` },
      })
      .returning({ id: contatos.id });
    contatoIdInterno = inserted[0]!.id;
  }

  const { pedido, itens } = mapPedido(p, contatoIdInterno);

  const insertedPedido = await db
    .insert(pedidos)
    .values(pedido)
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
    .returning({ id: pedidos.id });

  const pedidoId = insertedPedido[0]!.id;

  if (itens.length > 0) {
    // Limpa itens antigos do pedido (idempotente em re-run).
    await db.delete(pedidoItens).where(drizzleSql`pedido_id = ${pedidoId}`);
    await db.insert(pedidoItens).values(itens.map((i) => ({ ...i, pedidoId })));
  }
}

async function importarContatos(path: string): Promise<number> {
  console.log(`\n→ Importando contatos de ${path}`);
  let buffer: BlingContato[] = [];
  let count = 0;
  await streamLines(path, async (line, n) => {
    try {
      const obj = JSON.parse(line) as BlingContato;
      buffer.push(obj);
      if (buffer.length >= BATCH_SIZE) {
        await upsertContatosBatch(buffer);
        count += buffer.length;
        buffer = [];
      }
      if (n % PROGRESS_EVERY === 0) {
        console.log(`  ${n} linhas processadas (${count} inseridos/atualizados)`);
      }
    } catch (err) {
      console.warn(`  linha ${n}: JSON inválido — ${(err as Error).message}`);
    }
  });
  if (buffer.length > 0) {
    await upsertContatosBatch(buffer);
    count += buffer.length;
  }
  console.log(`  ✓ ${count} contatos processados.`);
  return count;
}

async function importarPedidos(path: string): Promise<number> {
  console.log(`\n→ Importando pedidos de ${path}`);
  let count = 0;
  await streamLines(path, async (line, n) => {
    try {
      const obj = JSON.parse(line) as BlingPedidoVenda;
      await upsertPedidoComItens(obj);
      count++;
      if (n % PROGRESS_EVERY === 0) {
        console.log(`  ${n} linhas processadas (${count} pedidos)`);
      }
    } catch (err) {
      console.warn(`  linha ${n}: erro ao processar — ${(err as Error).message}`);
    }
  });
  console.log(`  ✓ ${count} pedidos processados.`);
  return count;
}

async function main() {
  const contatosNdjson = resolve(NDJSON_DIR, 'bling_contatos.ndjson');
  const pedidosFullNdjson = resolve(NDJSON_DIR, 'bling_pedidos_full.ndjson');
  const pedidosListNdjson = resolve(NDJSON_DIR, 'bling_pedidos_list.ndjson');

  console.log(`Bootstrap Bling → Postgres`);
  console.log(`Diretório NDJSON: ${NDJSON_DIR}`);

  const { existsSync } = await import('node:fs');

  let cContatos = 0;
  let cPedidos = 0;

  if (existsSync(contatosNdjson)) {
    cContatos = await importarContatos(contatosNdjson);
  } else {
    console.log(`! ${contatosNdjson} não existe — pulando contatos (stubs serão criados via pedidos).`);
  }

  const pedidosPath = existsSync(pedidosFullNdjson)
    ? pedidosFullNdjson
    : existsSync(pedidosListNdjson)
      ? pedidosListNdjson
      : null;

  if (pedidosPath) {
    cPedidos = await importarPedidos(pedidosPath);
  } else {
    console.log('! Nenhum ndjson de pedidos encontrado. Rode primeiro bling_sync.ps1.');
  }

  console.log(`\nResumo:`);
  console.log(`  contatos: ${cContatos}`);
  console.log(`  pedidos:  ${cPedidos}`);
  console.log(`\n✓ Bootstrap concluído.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Bootstrap falhou:', err);
    process.exit(1);
  });
