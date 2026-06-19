// Types parciais do Bling API v3 — apenas campos consumidos pelo CRM.
// Referência completa: bling-sdk-ref clonado em ~/Documents/ (ver memory/reference-bling-arquivos).

// Situação de contato (pegadinha #6 da memória).
export type BlingContatoSituacao = 'A' | 'E' | 'I' | 'S';

export interface BlingContato {
  id: number;
  nome: string;
  numeroDocumento?: string;
  telefone?: string;
  celular?: string;
  email?: string;
  situacao?: BlingContatoSituacao;
  tiposContato?: Array<{ id: number; descricao: string }>;
  endereco?: {
    geral?: {
      endereco?: string;
      cep?: string;
      bairro?: string;
      municipio?: string;
      uf?: string;
    };
  };
  dadosAdicionais?: Record<string, unknown>;
}

export interface BlingSituacaoPedido {
  id: number;
  valor: number; // código 1..N
}

export interface BlingPedidoItem {
  id?: number;
  codigo?: string;
  descricao: string;
  quantidade: number;
  valor: number;
  unidade?: string;
}

export interface BlingPedidoVenda {
  id: number;
  numero: number;
  numeroLoja?: string;
  data: string; // YYYY-MM-DD
  dataSaida?: string;
  dataPrevista?: string;
  total: number;
  totalProdutos?: number;
  situacao: BlingSituacaoPedido;
  contato: {
    id: number;
    nome: string;
    tipoPessoa?: string;
    numeroDocumento?: string;
  };
  vendedor?: {
    id: number;
    contato?: { id?: number; nome?: string };
    comissao?: number;
  };
  itens?: BlingPedidoItem[];
}

// Lista paginada do endpoint /pedidos/vendas.
export interface BlingListResponse<T> {
  data: T[];
}

export interface BlingTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // segundos
  refresh_expires_in?: number;
  token_type: 'Bearer';
  scope?: string;
}

// Mapeamento dos códigos `situacao.valor` em pedidos (subset relevante).
// Fonte: doc oficial + bling-sdk-ref. Reconfirmar quando vier payload real.
export const SITUACAO_VALOR = {
  EM_ABERTO: 6,
  ATENDIDO: 9,
  CANCELADO: 12,
  EM_DIGITACAO: 15,
  VERIFICADO: 16,
} as const;

export type SituacaoValor = (typeof SITUACAO_VALOR)[keyof typeof SITUACAO_VALOR];

// ─── Financeiro ──────────────────────────────────────────────────────────────

export interface BlingFormaPagamento {
  id: number;
  descricao: string;
  tipoPagamento?: number;
  situacao?: string;
  padrao?: boolean;
}

export interface BlingCategoriaFinanceira {
  id: number;
  descricao: string;
  tipo?: string; // 'R' | 'D'
  situacao?: string;
}

export interface BlingContaReceber {
  id: number;
  situacao?: string;
  vencimento?: string;     // YYYY-MM-DD
  vencimentoOriginal?: string;
  valor?: number;
  saldo?: number;
  historico?: string;
  numeroBanco?: string;
  contato?: { id: number; nome?: string; numeroDocumento?: string; tipo?: string };
  categoria?: { id: number; descricao?: string };
}

export interface BlingContaPagar {
  id: number;
  situacao?: string;
  vencimento?: string;
  vencimentoOriginal?: string;
  valor?: number;
  saldo?: number;
  historico?: string;
  numeroBanco?: string;
  fornecedor?: { id: number; nome?: string; numeroDocumento?: string };
  categoria?: { id: number; descricao?: string };
}

// ─── Produtos ────────────────────────────────────────────────────────────────

export interface BlingCategoriaProduto {
  id: number;
  descricao: string;
}

export interface BlingDeposito {
  id: number;
  descricao: string;
  situacao?: string;
  padrao?: boolean;
}

export interface BlingProduto {
  id: number;
  nome: string;
  codigo?: string;
  tipo?: string; // 'P' | 'S' | 'K'
  situacao?: string;
  preco?: number;
  precoCusto?: number;
  unidade?: string;
  categoria?: { id: number; descricao?: string };
  variacoes?: BlingProdutoVariacao[];
  estoque?: { saldoVirtual?: number; saldoFisico?: number };
}

export interface BlingProdutoVariacao {
  id: number;
  nome?: string;
  codigo?: string;
  preco?: number;
}

export interface BlingEstoque {
  produto: { id: number; nome?: string };
  deposito?: { id: number; descricao?: string };
  saldoVirtual?: number;
  saldoFisico?: number;
}

// ─── Pedidos de compra ────────────────────────────────────────────────────────

export interface BlingPedidoCompraItem {
  id?: number;
  descricao: string;
  quantidade?: number;
  valor?: number;
  produto?: { id: number };
}

export interface BlingPedidoCompra {
  id: number;
  numero?: number;
  data?: string;
  situacao?: { id: number; valor?: number };
  total?: number;
  fornecedor?: { id: number; nome?: string };
  itens?: BlingPedidoCompraItem[];
}

// ─── Fiscal ──────────────────────────────────────────────────────────────────

export interface BlingNaturezaOperacao {
  id: number;
  descricao: string;
  tipo?: string;
}

export interface BlingNFe {
  id: number;
  numero?: string | number;
  serie?: string | number;
  situacao?: number;
  dataEmissao?: string;
  contato?: { id: number; nome?: string };
  valorTotal?: number;
  chaveAcesso?: string;
}

export interface BlingNFCe {
  id: number;
  numero?: string | number;
  serie?: string | number;
  situacao?: number;
  dataEmissao?: string;
  valorTotal?: number;
  chaveAcesso?: string;
}

// ─── Logística / Vendedores ───────────────────────────────────────────────────

export interface BlingLogistica {
  id: number;
  nome: string;
  tipo?: string;
  situacao?: string;
}

export interface BlingLogisticaRemessa {
  id: number;
  situacao?: string;
  codigoRastreio?: string;
  pedido?: { id: number; numero?: string };
  logistica?: { id: number; nome?: string };
}

export interface BlingVendedor {
  id: number;
  contato?: { id: number; nome?: string };
  comissao?: number;
}
