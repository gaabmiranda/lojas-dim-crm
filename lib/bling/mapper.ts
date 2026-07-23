import type {
  NewContato,
  NewPedido,
  NewPedidoItem,
} from '@/db/schema';
import type { BlingContato, BlingPedidoItem, BlingPedidoVenda } from './types';

// Extrai telefone preferindo celular, com fallback pra telefone fixo.
// Bling pode entregar como string simples ou como objeto — toleramos ambos.
export function extrairTelefone(c: BlingContato): string | undefined {
  const candidatos = [c.celular, c.telefone].filter(Boolean) as string[];
  for (const t of candidatos) {
    const onlyDigits = t.replace(/\D/g, '');
    if (onlyDigits.length >= 10) return onlyDigits;
  }
  return undefined;
}

export function mapContato(c: BlingContato): NewContato {
  return {
    idBling: Number(c.id),
    nome: c.nome ?? '',
    telefone: extrairTelefone(c),
    email: c.email,
    situacaoBling: c.situacao,
    dadosExtrasJson: c as unknown as Record<string, unknown>,
  };
}

export function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  // Bling envia "YYYY-MM-DD". new Date("2026-06-15") → meia-noite UTC.
  // Preservamos a data calendario interpretando como meia-noite BRT.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, y, mo, d] = m;
  // BRT = UTC-3 (sem horário de verão). Meia-noite BRT = 03:00 UTC.
  const dt = new Date(`${y}-${mo}-${d}T03:00:00Z`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export interface MappedPedido {
  pedido: NewPedido;
  itens: Omit<NewPedidoItem, 'pedidoId'>[];
}

// Mapeia pedido Bling para inserção. `contatoId` precisa ser preenchido pelo caller
// (depende de lookup/upsert do contato).
export function mapPedido(p: BlingPedidoVenda, contatoIdInterno: number): MappedPedido {
  const pedido: NewPedido = {
    idBling: Number(p.id),
    contatoId: contatoIdInterno,
    numero: p.numero != null ? String(p.numero) : null,
    data: parseDate(p.data) as NewPedido['data'],
    dataSaida: parseDate(p.dataSaida) as NewPedido['dataSaida'],
    situacaoId: p.situacao?.id,
    situacaoValor: p.situacao?.valor,
    total: p.total != null ? String(p.total) : null,
    totalProdutos: p.totalProdutos != null ? String(p.totalProdutos) : null,
    dadosCompletosJson: p as unknown as Record<string, unknown>,
  };

  const itens: Omit<NewPedidoItem, 'pedidoId'>[] = (p.itens ?? []).map(mapItem);

  return { pedido, itens };
}

function mapItem(i: BlingPedidoItem): Omit<NewPedidoItem, 'pedidoId'> {
  const qty = i.quantidade ?? 0;
  const unit = i.valor ?? 0;
  return {
    descricao: i.descricao,
    quantidade: String(qty),
    valorUnitario: String(unit),
    valorTotal: String(qty * unit),
  };
}
