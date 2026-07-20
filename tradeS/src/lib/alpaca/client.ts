import { env } from "@/lib/env";
import { toAlpacaSymbol } from "./symbols";

export interface AlpacaClock {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}

export interface AlpacaAccount {
  equity: string;
  cash: string;
  buying_power: string;
  [key: string]: unknown;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  side: "buy" | "sell";
  type: string;
  qty: string | null;
  notional: string | null;
  status: string;
  filled_avg_price: string | null;
  legs?: AlpacaOrder[] | null;
  [key: string]: unknown;
}

class AlpacaHttpError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "AlpacaHttpError";
  }
}

function authHeaders(): Record<string, string> {
  if (!env.hasAlpacaKeys || !env.activeKeyId || !env.activeSecretKey) {
    throw new Error("Alpaca API keys are not configured");
  }
  return {
    "APCA-API-KEY-ID": env.activeKeyId,
    "APCA-API-SECRET-KEY": env.activeSecretKey,
  };
}

async function request<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...authHeaders(), "Content-Type": "application/json", ...init?.headers },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new AlpacaHttpError(res.status, body, `Alpaca ${path} -> ${res.status}`);
  }
  return body as T;
}

function trading<T>(path: string, init?: RequestInit) {
  return request<T>(env.tradingBaseUrl, path, init);
}

function data<T>(path: string, init?: RequestInit) {
  return request<T>(env.dataBaseUrl, path, init);
}

export const alpaca = {
  getClock: () => trading<AlpacaClock>("/v2/clock"),
  getAccount: () => trading<AlpacaAccount>("/v2/account"),

  getPositions: () => trading<unknown[]>("/v2/positions"),
  /** cancelOrders=true also cancels open orders (bracket legs) on the symbol. */
  closePosition: (symbol: string, cancelOrders = false) =>
    trading<AlpacaOrder>(
      `/v2/positions/${toAlpacaSymbol(symbol)}${cancelOrders ? "?cancel_orders=true" : ""}`,
      { method: "DELETE" },
    ),

  listOrders: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return trading<AlpacaOrder[]>(`/v2/orders${qs ? `?${qs}` : ""}`);
  },
  cancelOrder: (orderId: string) =>
    trading<void>(`/v2/orders/${orderId}`, { method: "DELETE" }),

  submitOrder: (order: Record<string, unknown>) =>
    trading<AlpacaOrder>("/v2/orders", {
      method: "POST",
      body: JSON.stringify(order),
    }),

  getLatestTrade: (symbol: string) =>
    data<{ trade: { p: number; t: string } }>(
      `/v2/stocks/${toAlpacaSymbol(symbol)}/trades/latest`,
    ),

  getBars: (
    symbol: string,
    params: { timeframe: string; start?: string; end?: string; limit?: number },
  ) => {
    const qs = new URLSearchParams({
      timeframe: params.timeframe,
      ...(params.start ? { start: params.start } : {}),
      ...(params.end ? { end: params.end } : {}),
      ...(params.limit ? { limit: String(params.limit) } : {}),
    });
    return data<{ bars: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }> }>(
      `/v2/stocks/${toAlpacaSymbol(symbol)}/bars?${qs.toString()}`,
    );
  },

  getNews: (symbols: string[], limit = 10) => {
    const qs = new URLSearchParams({
      symbols: symbols.map(toAlpacaSymbol).join(","),
      limit: String(limit),
    });
    return data<{ news: unknown[] }>(`/v1beta1/news?${qs.toString()}`);
  },
};

export { AlpacaHttpError };
