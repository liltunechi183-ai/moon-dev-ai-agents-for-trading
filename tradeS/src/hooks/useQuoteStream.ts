"use client";

import { useEffect, useRef, useState } from "react";

export interface Quote {
  symbol: string;
  price: number;
  prevClose: number | null;
  dayOpen: number | null;
  ts: number;
  marketOpen: boolean;
  source: "alpaca" | "yahoo";
  delayed: boolean;
  currency: string;
}

export interface ClockState {
  isOpen: boolean | null;
  nextOpen?: string;
  nextClose?: string;
}

export function useQuoteStream() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [clock, setClock] = useState<ClockState>({ isOpen: null });
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/quotes/stream");
    esRef.current = es;

    es.addEventListener("open", () => setConnected(true));

    es.addEventListener("quotes", (evt) => {
      const rows: Quote[] = JSON.parse((evt as MessageEvent).data);
      setQuotes(() => {
        const next: Record<string, Quote> = {};
        for (const row of rows) next[row.symbol] = row;
        return next;
      });
    });

    es.addEventListener("clock", (evt) => {
      setClock(JSON.parse((evt as MessageEvent).data));
    });

    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  return { quotes, clock, connected };
}
