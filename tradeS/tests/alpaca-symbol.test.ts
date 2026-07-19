import { describe, it, expect } from "vitest";
import { toAlpacaSymbol, toAppSymbol, isUsTicker } from "@/lib/alpaca/symbols";

describe("alpaca symbol notation", () => {
  it("converts app dash notation to alpaca dot notation", () => {
    expect(toAlpacaSymbol("BRK-B")).toBe("BRK.B");
    expect(toAlpacaSymbol("AAPL")).toBe("AAPL");
  });

  it("converts alpaca dot notation back to app dash notation", () => {
    expect(toAppSymbol("BRK.B")).toBe("BRK-B");
    expect(toAppSymbol("AAPL")).toBe("AAPL");
  });

  it("round-trips share-class symbols", () => {
    expect(toAppSymbol(toAlpacaSymbol("BRK-B"))).toBe("BRK-B");
  });

  it("identifies US vs international tickers", () => {
    expect(isUsTicker("AAPL")).toBe(true);
    expect(isUsTicker("BRK-B")).toBe(true);
    expect(isUsTicker("TD.TO")).toBe(false);
    expect(isUsTicker("2330.TW")).toBe(false);
  });
});
