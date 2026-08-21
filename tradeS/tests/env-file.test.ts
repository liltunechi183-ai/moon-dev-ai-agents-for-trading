import { describe, it, expect } from "vitest";
import {
  sanitizeValue,
  upsertEnvVar,
  maskSecret,
  validateKeyId,
  validateSecret,
} from "@/lib/env-file";

describe("sanitizeValue", () => {
  it("trims surrounding whitespace", () => {
    expect(sanitizeValue("  PK123  ")).toBe("PK123");
  });
  it("strips the quotes people paste along with a copied value", () => {
    expect(sanitizeValue('"PK123"')).toBe("PK123");
    expect(sanitizeValue("'PK123'")).toBe("PK123");
    expect(sanitizeValue(' "  PK123  " ')).toBe("PK123");
  });
  it("leaves an unquoted value with internal quotes alone", () => {
    expect(sanitizeValue(`PK"123`)).toBe(`PK"123`);
  });
});

describe("upsertEnvVar", () => {
  const env = [
    "# Alpaca paper account",
    "ALPACA_KEY_ID=",
    "ALPACA_SECRET_KEY=",
    "ALPACA_PAPER=true",
    "",
    "DATABASE_PATH=./data/trades.db",
    "",
  ].join("\n");

  it("replaces a key in place without touching any other line", () => {
    const out = upsertEnvVar(env, "ALPACA_KEY_ID", "PK123");
    expect(out.split("\n")[1]).toBe("ALPACA_KEY_ID=PK123");
    expect(out).toContain("DATABASE_PATH=./data/trades.db");
    expect(out).toContain("ALPACA_PAPER=true");
    expect(out.split("\n").length).toBe(env.split("\n").length);
  });

  it("overwrites an existing value rather than appending a duplicate", () => {
    const once = upsertEnvVar(env, "ALPACA_KEY_ID", "PK111");
    const twice = upsertEnvVar(once, "ALPACA_KEY_ID", "PK222");
    expect(twice.match(/^ALPACA_KEY_ID=/gm)?.length).toBe(1);
    expect(twice).toContain("ALPACA_KEY_ID=PK222");
  });

  it("appends a key that isn't present, with one trailing newline", () => {
    const out = upsertEnvVar(env, "QUIVER_API_KEY", "abc");
    expect(out.endsWith("QUIVER_API_KEY=abc\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });

  it("appends rather than editing a commented-out line — a comment is not an assignment", () => {
    const commented = "# ALPACA_ALLOW_LIVE=false\n";
    const out = upsertEnvVar(commented, "ALPACA_ALLOW_LIVE", "true");
    expect(out).toContain("# ALPACA_ALLOW_LIVE=false");
    expect(out).toContain("\nALPACA_ALLOW_LIVE=true\n");
  });

  it("handles an empty file", () => {
    expect(upsertEnvVar("", "ALPACA_KEY_ID", "PK1")).toBe("ALPACA_KEY_ID=PK1\n");
  });
});

describe("maskSecret", () => {
  it("shows the first and last four characters of a long secret", () => {
    const masked = maskSecret("abcdefghijklmnop");
    expect(masked.startsWith("abcd")).toBe(true);
    expect(masked.endsWith("mnop")).toBe(true);
    expect(masked).not.toContain("efgh");
    expect(masked.length).toBe(16);
  });
  it("reveals nothing at all for a short value", () => {
    expect(maskSecret("abcd")).toBe("****");
  });
});

describe("validateKeyId", () => {
  it("accepts a normal paper key id with no warning", () => {
    expect(validateKeyId("PKABC123")).toEqual({ ok: true });
  });
  it("rejects empty and spaced values", () => {
    expect(validateKeyId("").ok).toBe(false);
    expect(validateKeyId("PK ABC").ok).toBe(false);
  });
  it("warns — but still accepts — a live-looking key", () => {
    const r = validateKeyId("AKABC123");
    expect(r.ok).toBe(true);
    expect(r.warning).toContain("LIVE");
  });
  it("warns on an unexpected prefix", () => {
    expect(validateKeyId("XYZ123").warning).toBeTruthy();
  });
});

describe("validateSecret", () => {
  it("accepts a long secret cleanly", () => {
    expect(validateSecret("a".repeat(40))).toEqual({ ok: true });
  });
  it("rejects empty and spaced values", () => {
    expect(validateSecret("").ok).toBe(false);
    expect(validateSecret("abc def").ok).toBe(false);
  });
  it("warns on a suspiciously short secret", () => {
    expect(validateSecret("abc123").warning).toContain("short");
  });
});
