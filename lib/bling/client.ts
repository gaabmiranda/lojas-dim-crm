import { ensureValidAccessToken, refreshTokens } from './tokens';
import type {
  BlingContato,
  BlingListResponse,
  BlingPedidoVenda,
} from './types';

const BLING_BASE_URL = 'https://www.bling.com.br/Api/v3';

// ─── Throttle global (semáforo) ──────────────────────────────────────────
// Limite Bling: 3 req/s por aplicativo (pegadinha #3). Margem: 2 req/s.
const MIN_INTERVAL_MS = 500; // ~2 req/s
let lastCallAt = 0;
let chainPromise: Promise<void> = Promise.resolve();

function throttle(): Promise<void> {
  chainPromise = chainPromise.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - now);
    if (wait > 0) {
      await sleep(wait);
    }
    lastCallAt = Date.now();
  });
  return chainPromise;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── blingFetch ──────────────────────────────────────────────────────────
// Auth automática + retry 429 (3x, 1500ms) + retry 401 (1x após refresh).
export async function blingFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  attempt = 0,
  refreshed = false,
): Promise<T> {
  await throttle();
  const token = await ensureValidAccessToken();
  const url = path.startsWith('http') ? path : `${BLING_BASE_URL}${path}`;
  const resp = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (resp.status === 429 && attempt < 3) {
    await sleep(1500);
    return blingFetch<T>(path, init, attempt + 1, refreshed);
  }

  if (resp.status === 401 && !refreshed) {
    await refreshTokens();
    return blingFetch<T>(path, init, attempt, true);
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new BlingApiError(resp.status, text, path);
  }

  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export class BlingApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly responseBody: string,
    public readonly path: string,
  ) {
    super(`Bling API ${status} em ${path}: ${responseBody.slice(0, 200)}`);
    this.name = 'BlingApiError';
  }
}

// ─── Helpers tipados ─────────────────────────────────────────────────────
export async function getContato(id: number): Promise<BlingContato> {
  const resp = await blingFetch<{ data: BlingContato }>(`/contatos/${id}`);
  return resp.data;
}

export async function getPedido(id: number): Promise<BlingPedidoVenda> {
  const resp = await blingFetch<{ data: BlingPedidoVenda }>(`/pedidos/vendas/${id}`);
  return resp.data;
}

export interface ListPedidosParams {
  pagina?: number;
  limite?: number;
  dataAlteracaoInicial?: string; // YYYY-MM-DD
  dataAlteracaoFinal?: string;
  idsContatos?: number[];
  idsSituacoes?: number[];
}

export async function listPedidos(
  params: ListPedidosParams = {},
): Promise<BlingListResponse<BlingPedidoVenda>> {
  const qs = new URLSearchParams();
  if (params.pagina != null) qs.set('pagina', String(params.pagina));
  if (params.limite != null) qs.set('limite', String(params.limite));
  if (params.dataAlteracaoInicial) qs.set('dataAlteracaoInicial', params.dataAlteracaoInicial);
  if (params.dataAlteracaoFinal) qs.set('dataAlteracaoFinal', params.dataAlteracaoFinal);
  if (params.idsContatos) {
    for (const id of params.idsContatos) qs.append('idsContatos[]', String(id));
  }
  if (params.idsSituacoes) {
    for (const id of params.idsSituacoes) qs.append('idsSituacoes[]', String(id));
  }
  const query = qs.toString();
  return await blingFetch<BlingListResponse<BlingPedidoVenda>>(
    `/pedidos/vendas${query ? `?${query}` : ''}`,
  );
}
