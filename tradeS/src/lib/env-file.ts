/**
 * Pure logic for `scripts/set-alpaca-keys.ts` — editing a `.env.local` file
 * by key without disturbing anything else in it. Kept dependency-free (no
 * fs here) so it's fully unit-testable; the CLI script does the reading,
 * prompting, and writing.
 *
 * Why this exists: hand-editing a dotfile in a GUI editor is a surprisingly
 * common place to get stuck (invisible quotes, stray spaces around `=`, a
 * rich-text save that mangles the file). A prompt-driven writer removes all
 * of that.
 */

/** Strip whitespace and the quotes people paste along with a copied secret. */
export function sanitizeValue(raw: string): string {
  let v = raw.trim();
  while (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/**
 * Set `key=value` in dotenv-style `content`. Replaces the first uncommented
 * assignment of that key in place (preserving its position and every other
 * line); appends it if the key isn't there at all. A commented-out
 * `# KEY=` line is left alone — it's documentation, not an assignment.
 */
export function upsertEnvVar(content: string, key: string, value: string): string {
  const lines = content.split("\n");
  const assignment = `${key}=${value}`;
  const matches = (line: string) => line.trimStart().startsWith(`${key}=`);

  const index = lines.findIndex(matches);
  if (index !== -1) {
    lines[index] = assignment;
    return lines.join("\n");
  }

  // Append, keeping exactly one trailing newline at the end of the file.
  const trimmed = content.replace(/\n+$/, "");
  return trimmed === "" ? `${assignment}\n` : `${trimmed}\n${assignment}\n`;
}

/** Show enough of a secret to recognize it, never enough to reuse it. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}${"*".repeat(value.length - 8)}${value.slice(-4)}`;
}

export interface KeyValidation {
  ok: boolean;
  /** A warning worth showing even when ok — e.g. an unexpected prefix. */
  warning?: string;
  /** Why it was rejected, when not ok. */
  error?: string;
}

/** Alpaca paper key ids start with PK; live ids with AK. Anything else is
 * probably the wrong string pasted (an account id, an email, a URL). */
export function validateKeyId(value: string): KeyValidation {
  if (value === "") return { ok: false, error: "the Key ID is empty" };
  if (/\s/.test(value)) return { ok: false, error: "the Key ID contains a space" };
  if (value.startsWith("AK")) {
    return {
      ok: true,
      warning: "that looks like a LIVE key (starts with AK), not a paper key (PK)",
    };
  }
  if (!value.startsWith("PK")) {
    return { ok: true, warning: "Alpaca paper Key IDs normally start with PK" };
  }
  return { ok: true };
}

export function validateSecret(value: string): KeyValidation {
  if (value === "") return { ok: false, error: "the Secret Key is empty" };
  if (/\s/.test(value)) return { ok: false, error: "the Secret Key contains a space" };
  if (value.length < 20) {
    return { ok: true, warning: "that Secret Key looks short — double-check you copied all of it" };
  }
  return { ok: true };
}
