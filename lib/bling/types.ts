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
