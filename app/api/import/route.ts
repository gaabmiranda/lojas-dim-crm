/**
 * Endpoint de importação completa do Bling → CRM.
 * Busca dados diretamente da API Bling, página por página, e faz upsert.
 * Protegido por X-N8N-Secret (mesmo middleware do bootstrap).
 *
 * POST /api/import
 * Headers: X-Import-Module: <modulo>, X-N8N-Secret: <secret>
 * Query:   ?pagina=1 (default 1)
 *
 * Módulos: formasPagamento | categoriasFinanceiras | contasReceber |
 *          contasPagar | categoriasProdutos | depositos | produtos |
 *          estoques | pedidosCompra | naturezasOperacao | nfe | nfce |
 *          logisticas | logisticasRemessas | vendedores
 */
import { NextResponse } from 'next/server';
import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  formasPagamento,
  categoriasFinanceiras,
  contasReceber,
  contasPagar,
  categoriasProdutos,
  depositos,
  produtos,
  produtoVariacoes,
  estoques,
  pedidosCompra,
  pedidosCompraItens,
  naturezasOperacao,
  nfe,
  nfce,
  logisticas,
  logisticasRemessas,
  vendedoresBling,
  contatos,
} from '@/db/schema';
import { blingFetch } from '@/lib/bling/client';
import { verifyN8nSecret } from '@/lib/n8n/trigger';
import type {
  BlingFormaPagamento,
  BlingCategoriaFinanceira,
  BlingContaReceber,
  BlingContaPagar,
  BlingCategoriaProduto,
  BlingDeposito,
  BlingProduto,
  BlingEstoque,
  BlingPedidoCompra,
  BlingNaturezaOperacao,
  BlingNFe,
  BlingNFCe,
  BlingLogistica,
  BlingLogisticaRemessa,
  BlingVendedor,
} from '@/lib/bling/types';

const MODULES = [
  'formasPagamento', 'categoriasFinanceiras',
  'contasReceber', 'contasPagar',
  'categoriasProdutos', 'depositos', 'produtos', 'estoques',
  'pedidosCompra',
  'naturezasOperacao', 'nfe', 'nfce',
  'logisticas', 'logisticasRemessas',
  'vendedores',
] as const;

type Module = (typeof MODULES)[number];

export async function POST(req: Request) {
  if (!verifyN8nSecret(req)) {
    return new NextResponse('forbidden', { status: 403 });
  }

  const modulo = req.headers.get('X-Import-Module') as Module | null;
  if (!modulo || !MODULES.includes(modulo)) {
    return NextResponse.json(
      { error: `X-Import-Module inválido. Opções: ${MODULES.join(', ')}` },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const pagina = parseInt(url.searchParams.get('pagina') ?? '1', 10);

  try {
    const result = await handlers[modulo](pagina);
    return NextResponse.json({ modulo, pagina, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ modulo, pagina, error: msg }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type HandlerResult = { processed: number; nextPage: number | null };

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

async function fetchPage<T>(path: string, pagina: number, limite = 100): Promise<{ data: T[]; hasMore: boolean }> {
  const qs = `?pagina=${pagina}&limite=${limite}`;
  const resp = await blingFetch<{ data: T[] }>(`${path}${qs}`);
  return { data: resp.data ?? [], hasMore: (resp.data?.length ?? 0) >= limite };
}

// ─── Handlers ────────────────────────────────────────────────────────────────

const handlers: Record<Module, (pagina: number) => Promise<HandlerResult>> = {

  // ── formasPagamento ────────────────────────────────────────────────────────
  async formasPagamento(pagina) {
    const { data, hasMore } = await fetchPage<BlingFormaPagamento>('/formas-de-pagamento', pagina);
    if (data.length) {
      await db.insert(formasPagamento).values(
        data.map(r => ({
          idBling: r.id,
          descricao: r.descricao,
          tipoPagamento: r.tipoPagamento ?? null,
          situacao: r.situacao ?? null,
          padrao: r.padrao ?? false,
        }))
      ).onConflictDoUpdate({
        target: formasPagamento.idBling,
        set: {
          descricao: drizzleSql`excluded.descricao`,
          tipoPagamento: drizzleSql`excluded.tipo_pagamento`,
          situacao: drizzleSql`excluded.situacao`,
          padrao: drizzleSql`excluded.padrao`,
        },
      });
    }
    return { processed: data.length, nextPage: hasMore ? pagina + 1 : null };
  },

  // ── categoriasFinanceiras ──────────────────────────────────────────────────
  async categoriasFinanceiras(pagina) {
    const { data, hasMore } = await fetchPage<BlingCategoriaFinanceira>('/categorias/receitas-despesas', pagina);
    if (data.length) {
      await db.insert(categoriasFinanceiras).values(
        data.map(r => ({
          idBling: r.id,
          descricao: r.descricao,
          tipo: r.tipo ?? null,
          situacao: r.situacao ?? null,
        }))
      ).onConflictDoUpdate({
        target: categoriasFinanceiras.idBling,
        set: {
          descricao: drizzleSql`excluded.descricao`,
          tipo: drizzleSql`excluded.tipo`,
          situacao: drizzleSql`excluded.situacao`,
        },
      });
    }
    return { processed: data.length, nextPage: hasMore ? pagina + 1 : null };
  },

  // ── contasReceber ──────────────────────────────────────────────────────────
  async contasReceber(pagina) {
    const { data, hasMore } = await fetchPage<BlingContaReceber>('/contas/receber', pagina);

    // Resolve contatoId interno
    const ids = data.map(r => r.contato?.id).filter(Boolean) as number[];
    const rows = ids.length
      ? await db.select({ id: contatos.id, idBling: contatos.idBling }).from(contatos)
      : [];
    const contatoMap = new Map(rows.map(r => [r.idBling, r.id]));

    if (data.length) {
      await db.insert(contasReceber).values(
        data.map(r => ({
          idBling: r.id,
          contatoIdBling: r.contato?.id ?? null,
          contatoId: r.contato?.id ? (contatoMap.get(r.contato.id) ?? null) : null,
          situacao: r.situacao ?? null,
          vencimento: toDate(r.vencimento),
          vencimentoOriginal: toDate(r.vencimentoOriginal),
          valor: r.valor?.toString() ?? null,
          saldo: r.saldo?.toString() ?? null,
          historico: r.historico ?? null,
          numeroBanco: r.numeroBanco ?? null,
          categoriaIdBling: r.categoria?.id ?? null,
          dadosJson: r as unknown as Record<string, unknown>,
        }))
      ).onConflictDoUpdate({
        target: contasReceber.idBling,
        set: {
          situacao: drizzleSql`excluded.situacao`,
          vencimento: drizzleSql`excluded.vencimento`,
          valor: drizzleSql`excluded.valor`,
          saldo: drizzleSql`excluded.saldo`,
          dadosJson: drizzleSql`excluded.dados_json`,
          atualizadoEm: drizzleSql`now()`,
        },
      });
    }
    return { processed: data.length, nextPage: hasMore ? pagina + 1 : null };
  },

  // ── contasPagar ────────────────────────────────────────────────────────────
  async contasPagar(pagina) {
    const { data, hasMore } = await fetchPage<BlingContaPagar>('/contas/pagar', pagina);

    const ids = data.map(r => r.fornecedor?.id).filter(Boolean) as number[];
    const rows = ids.length
      ? await db.select({ id: contatos.id, idBling: contatos.idBling }).from(contatos)
      : [];
    const contatoMap = new Map(rows.map(r => [r.idBling, r.id]));

    if (data.length) {
      await db.insert(contasPagar).values(
        data.map(r => ({
          idBling: r.id,
          fornecedorIdBling: r.fornecedor?.id ?? null,
          fornecedorId: r.fornecedor?.id ? (contatoMap.get(r.fornecedor.id) ?? null) : null,
          situacao: r.situacao ?? null,
          vencimento: toDate(r.vencimento),
          vencimentoOriginal: toDate(r.vencimentoOriginal),
          valor: r.valor?.toString() ?? null,
          saldo: r.saldo?.toString() ?? null,
          historico: r.historico ?? null,
          numeroBanco: r.numeroBanco ?? null,
          categoriaIdBling: r.categoria?.id ?? null,
          dadosJson: r as unknown as Record<string, unknown>,
        }))
      ).onConflictDoUpdate({
        target: contasPagar.idBling,
        set: {
          situacao: drizzleSql`excluded.situacao`,
          vencimento: drizzleSql`excluded.vencimento`,
          valor: drizzleSql`excluded.valor`,
          saldo: drizzleSql`excluded.saldo`,
          dadosJson: drizzleSql`excluded.dados_json`,
          atualizadoEm: drizzleSql`now()`,
        },
      });
    }
    return { processed: data.length, nextPage: hasMore ? pagina + 1 : null };
  },

  // ── categoriasProdutos ────────────────────────────────────────────────────
  async categoriasProdutos(pagina) {
    const { data, hasMore } = await fetchPage<BlingCategoriaProduto>('/categorias/produtos', pagina);
    if (data.length) {
      await db.insert(categoriasProdutos).values(
        data.map(r => ({ idBling: r.id, descricao: r.descricao }))
      ).onConflictDoUpdate({
        target: categoriasProdutos.idBling,
        set: { descricao: drizzleSql`excluded.descricao` },
      });
    }
    return { processed: data.length, nextPage: hasMore ? pagina + 1 : null };
  },

  // ── depositos ─────────────────────────────────────────────────────────────
  async depositos(pagina) {
    const { data, hasMore } = await fetchPage<BlingDeposito>('/depositos', pagina);
    if (data.length) {
      await db.insert(depositos).values(
        data.map(r => ({
          idBling: r.id,
          descricao: r.descricao,
          situacao: r.situacao ?? null,
          padrao: r.padrao ?? false,
        }))
      ).onConflictDoUpdate({
        target: depositos.idBling,
        set: {
          descricao: drizzleSql`excluded.descricao`,
          situacao: drizzleSql`excluded.situacao`,
        },
      });
    }
    return { processed: data.length, nextPage: hasMore ? pagina + 1 : null };
  },

  // ── produtos ──────────────────────────────────────────────────────────────
  async produtos(pagina) {
    const { data, hasMore } = await fetchPage<BlingProduto>('/produtos', pagina);
    if (data.length) {
      const inserted = await db.insert(produtos).values(
        data.map(r => ({
          idBling: r.id,
          nome: r.nome,
          codigo: r.codigo ?? null,
          tipo: r.tipo ?? null,
          situacao: r.situacao ?? null,
          preco: r.preco?.toString() ?? null,
          precoCusto: r.precoCusto?.toString() ?? null,
          unidade: r.unidade ?? null,
          categoriaIdBling: r.categoria?.id ?? null,
          dadosJson: r as unknown as Record<string, unknown>,
        }))
      ).onConflictDoUpdate({
        target: produtos.idBling,
        set: {
          nome: drizzleSql`excluded.nome`,
          preco: drizzleSql`excluded.preco`,
          precoCusto: drizzleSql`excluded.preco_custo`,
          situacao: drizzleSql`excluded.situacao`,
          dadosJson: drizzleSql`excluded.dados_json`,
          atualizadoEm: drizzleSql`now()`,
        },
      }).returning({ id: produtos.id, idBling: produtos.idBling });

      // Upsert variações embutidas (se vieram no payload)
      const variacoesBatch: typeof produtoVariacoes.$inferInsert[] = [];
      for (const r of data) {
        if (!r.variacoes?.length) continue;
        const produtoId = inserted.find(p => p.idBling === r.id)?.id;
        if (!produtoId) continue;
        for (const v of r.variacoes) {
          variacoesBatch.push({
            idBling: v.id,
            produtoId,
            produtoIdBling: r.id,
            nome: v.nome ?? null,
            codigo: v.codigo ?? null,
            preco: v.preco?.toString() ?? null,
          });
        }
      }
      if (variacoesBatch.length) {
        await db.insert(produtoVariacoes).values(variacoesBatch).onConflictDoUpdate({
          target: produtoVariacoes.idBling,
          set: {
            nome: drizzleSql`excluded.nome`,
            preco: drizzleSql`excluded.preco`,
          },
        });
      }
    }
    return { processed: data.length, nextPage: hasMore ? pagina + 1 : null };
  },

  // ── estoques ──────────────────────────────────────────────────────────────
  async estoques(pagina) {
    const { data, hasMore } = await fetchPage<BlingEstoque>('/estoques', pagina);

    // Resolve produtoId interno
    const prodIds = data.map(r => r.produto?.id).filter(Boolean) as number[];
    const prodRows = prodIds.length
      ? await db.select({ id: produtos.id, idBling: produtos.idBling }).from(produtos)
      : [];
    const prodMap = new Map(prodRows.map(r => [r.idBling, r.id]));

    if (data.length) {
      const vals = data
        .filter(r => r.produto?.id)
        .map(r => ({
          produtoIdBling: r.produto.id,
          produtoId: prodMap.get(r.produto.id) ?? null,
          depositoIdBling: r.deposito?.id ?? null,
          depositoNome: r.deposito?.descricao ?? null,
          saldoVirtual: r.saldoVirtual?.toString() ?? null,
          saldoFisico: r.saldoFisico?.toString() ?? null,
        }));

      if (vals.length) {
        await db.insert(estoques).values(vals).onConflictDoUpdate({
          target: [estoques.produtoIdBling, estoques.depositoIdBling],
          set: {
            saldoVirtual: drizzleSql`excluded.saldo_virtual`,
            saldoFisico: drizzleSql`excluded.saldo_fisico`,
            atualizadoEm: drizzleSql`now()`,
          },
        });
      }
    }
    return { processed: data.length, nextPage: hasMore ? pagina + 1 : null };
  },

  // ── pedidosCompra ─────────────────────────────────────────────────────────
  async pedidosCompra(pagina) {
    const { data, hasMore } = await fetchPage<BlingPedidoCompra>('/pedidos/compras', pagina);

    const fornIds = data.map(r => r.fornecedor?.id).filter(Boolean) as number[];
    const rows = fornIds.length
      ? await db.select({ id: contatos.id, idBling: contatos.idBling }).from(contatos)
      : [];
    const contatoMap = new Map(rows.map(r => [r.idBling, r.id]));

    if (data.length) {
      const inserted = await db.insert(pedidosCompra).values(
        data.map(r => ({
          idBling: r.id,
          fornecedorIdBling: r.fornecedor?.id ?? null,
          fornecedorId: r.fornecedor?.id ? (contatoMap.get(r.fornecedor.id) ?? null) : null,
          numero: r.numero?.toString() ?? null,
          data: toDate(r.data),
          situacaoValor: r.situacao?.valor ?? null,
          total: r.total?.toString() ?? null,
          dadosJson: r as unknown as Record<string, unknown>,
        }))
      ).onConflictDoUpdate({
        target: pedidosCompra.idBling,
        set: {
          situacaoValor: drizzleSql`excluded.situacao_valor`,
          total: drizzleSql`excluded.total`,
          dadosJson: drizzleSql`excluded.dados_json`,
          atualizadoEm: drizzleSql`now()`,
        },
      }).returning({ id: pedidosCompra.id, idBling: pedidosCompra.idBling });

      const itensBatch: typeof pedidosCompraItens.$inferInsert[] = [];
      for (const r of data) {
        if (!r.itens?.length) continue;
        const pedidoId = inserted.find(p => p.idBling === r.id)?.id;
        if (!pedidoId) continue;
        for (const item of r.itens) {
          itensBatch.push({
            pedidoCompraId: pedidoId,
            produtoIdBling: item.produto?.id ?? null,
            descricao: item.descricao,
            quantidade: item.quantidade?.toString() ?? null,
            valorUnitario: item.valor?.toString() ?? null,
            valorTotal: item.quantidade && item.valor
              ? (item.quantidade * item.valor).toString()
              : null,
          });
        }
      }
      if (itensBatch.length) {
        await db.insert(pedidosCompraItens).values(itensBatch).onConflictDoNothing();
      }
    }
    return { processed: data.length, nextPage: hasMore ? pagina + 1 : null };
  },

  // ── naturezasOperacao ────────────────────────────────────────────────────
  async naturezasOperacao(pagina) {
    const { data, hasMore } = await fetchPage<BlingNaturezaOperacao>('/naturezas-de-operacoes', pagina);
    if (data.length) {
      await db.insert(naturezasOperacao).values(
        data.map(r => ({
          idBling: r.id,
          descricao: r.descricao,
          tipo: r.tipo ?? null,
        }))
      ).onConflictDoUpdate({
        target: naturezasOperacao.idBling,
        set: { descricao: drizzleSql`excluded.descricao`, tipo: drizzleSql`excluded.tipo` },
      });
    }
    return { processed: data.length, nextPage: hasMore ? pagina + 1 : null };
  },

  // ── nfe ───────────────────────────────────────────────────────────────────
  async nfe(pagina) {
    const { data, hasMore } = await fetchPage<BlingNFe>('/nfe', pagina);

    const ids = data.map(r => r.contato?.id).filter(Boolean) as number[];
    const rows = ids.length
      ? await db.select({ id: contatos.id, idBling: contatos.idBling }).from(contatos)
      : [];
    const contatoMap = new Map(rows.map(r => [r.idBling, r.id]));

    if (data.length) {
      await db.insert(nfe).values(
        data.map(r => ({
          idBling: r.id,
          numero: r.numero?.toString() ?? null,
          serie: r.serie?.toString() ?? null,
          situacao: r.situacao ?? null,
          dataEmissao: toDate(r.dataEmissao),
          contatoIdBling: r.contato?.id ?? null,
          contatoId: r.contato?.id ? (contatoMap.get(r.contato.id) ?? null) : null,
          valorTotal: r.valorTotal?.toString() ?? null,
          chave: r.chaveAcesso ?? null,
          dadosJson: r as unknown as Record<string, unknown>,
        }))
      ).onConflictDoUpdate({
        target: nfe.idBling,
        set: {
          situacao: drizzleSql`excluded.situacao`,
          valorTotal: drizzleSql`excluded.valor_total`,
          dadosJson: drizzleSql`excluded.dados_json`,
        },
      });
    }
    return { processed: data.length, nextPage: hasMore ? pagina + 1 : null };
  },

  // ── nfce ──────────────────────────────────────────────────────────────────
  async nfce(pagina) {
    const { data, hasMore } = await fetchPage<BlingNFCe>('/nfce', pagina);
    if (data.length) {
      await db.insert(nfce).values(
        data.map(r => ({
          idBling: r.id,
          numero: r.numero?.toString() ?? null,
          serie: r.serie?.toString() ?? null,
          situacao: r.situacao ?? null,
          dataEmissao: toDate(r.dataEmissao),
          valorTotal: r.valorTotal?.toString() ?? null,
          chave: r.chaveAcesso ?? null,
          dadosJson: r as unknown as Record<string, unknown>,
        }))
      ).onConflictDoUpdate({
        target: nfce.idBling,
        set: {
          situacao: drizzleSql`excluded.situacao`,
          valorTotal: drizzleSql`excluded.valor_total`,
          dadosJson: drizzleSql`excluded.dados_json`,
        },
      });
    }
    return { processed: data.length, nextPage: hasMore ? pagina + 1 : null };
  },

  // ── logisticas ────────────────────────────────────────────────────────────
  async logisticas(pagina) {
    const { data, hasMore } = await fetchPage<BlingLogistica>('/logisticas', pagina);
    if (data.length) {
      await db.insert(logisticas).values(
        data.map(r => ({
          idBling: r.id,
          nome: r.nome,
          tipo: r.tipo ?? null,
          situacao: r.situacao ?? null,
        }))
      ).onConflictDoUpdate({
        target: logisticas.idBling,
        set: { nome: drizzleSql`excluded.nome`, situacao: drizzleSql`excluded.situacao` },
      });
    }
    return { processed: data.length, nextPage: hasMore ? pagina + 1 : null };
  },

  // ── logisticasRemessas ────────────────────────────────────────────────────
  async logisticasRemessas(pagina) {
    const { data, hasMore } = await fetchPage<BlingLogisticaRemessa>('/logisticas/remessas', pagina);

    // Resolve pedidoId interno
    const pedidoIds = data.map(r => r.pedido?.id).filter(Boolean) as number[];
    const pedRows = pedidoIds.length
      ? await db.select({ id: pedidosCompra.id, idBling: pedidosCompra.idBling }).from(pedidosCompra)
      : [];
    const pedMap = new Map(pedRows.map(r => [r.idBling, r.id]));

    if (data.length) {
      await db.insert(logisticasRemessas).values(
        data.map(r => ({
          idBling: r.id,
          situacao: r.situacao ?? null,
          codigoRastreio: r.codigoRastreio ?? null,
          pedidoIdBling: r.pedido?.id ?? null,
          pedidoId: r.pedido?.id ? (pedMap.get(r.pedido.id) ?? null) : null,
          logisticaIdBling: r.logistica?.id ?? null,
          dadosJson: r as unknown as Record<string, unknown>,
        }))
      ).onConflictDoUpdate({
        target: logisticasRemessas.idBling,
        set: {
          situacao: drizzleSql`excluded.situacao`,
          codigoRastreio: drizzleSql`excluded.codigo_rastreio`,
          dadosJson: drizzleSql`excluded.dados_json`,
        },
      });
    }
    return { processed: data.length, nextPage: hasMore ? pagina + 1 : null };
  },

  // ── vendedores ────────────────────────────────────────────────────────────
  async vendedores(pagina) {
    const { data, hasMore } = await fetchPage<BlingVendedor>('/vendedores', pagina);
    if (data.length) {
      await db.insert(vendedoresBling).values(
        data.map(r => ({
          idBling: r.id,
          contatoIdBling: r.contato?.id ?? null,
          contatoNome: r.contato?.nome ?? null,
          comissao: r.comissao?.toString() ?? null,
        }))
      ).onConflictDoUpdate({
        target: vendedoresBling.idBling,
        set: {
          contatoNome: drizzleSql`excluded.contato_nome`,
          comissao: drizzleSql`excluded.comissao`,
        },
      });
    }
    return { processed: data.length, nextPage: hasMore ? pagina + 1 : null };
  },
};
