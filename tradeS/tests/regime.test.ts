import { describe, it, expect } from "vitest";
import { classifyRegime } from "@/lib/research/regime";

describe("classifyRegime", () => {
  it("bull-calm: above 200-sma with low VIX", () => {
    expect(classifyRegime(110, 100, 14)).toBe("bull-calm");
  });

  it("bull-vol: above 200-sma with elevated VIX", () => {
    expect(classifyRegime(110, 100, 28)).toBe("bull-vol");
  });

  it("bear: below 200-sma regardless of VIX", () => {
    expect(classifyRegime(90, 100, 14)).toBe("bear");
    expect(classifyRegime(90, 100, 35)).toBe("bear");
  });

  it("chop: within ±1% of the 200-sma", () => {
    expect(classifyRegime(100.5, 100, 18)).toBe("chop");
    expect(classifyRegime(99.5, 100, 18)).toBe("chop");
  });

  it("missing VIX defaults an uptrend to bull-calm", () => {
    expect(classifyRegime(110, 100, null)).toBe("bull-calm");
  });
});
