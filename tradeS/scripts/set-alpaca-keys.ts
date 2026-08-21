// Guided writer for the Alpaca paper keys: `npm run alpaca:keys`.
// Prompts for the Key ID and Secret Key, then writes them into .env.local
// without touching anything else in the file. Exists because hand-editing a
// dotfile in a GUI editor is an easy place to get stuck — stray quotes, a
// space around `=`, a rich-text save. Never prints the secret back in full,
// and never touches the live-trading keys.
//
// Also accepts `--key-id X --secret Y` for non-interactive use (scripted
// setup, tests). Prefer the prompts when a human is at the keyboard: argv
// values land in shell history.
//
// Bilingual output (EN/ES) to match the app itself.
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  sanitizeValue,
  upsertEnvVar,
  maskSecret,
  validateKeyId,
  validateSecret,
  type KeyValidation,
} from "../src/lib/env-file";

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env.local");
const EXAMPLE_PATH = path.join(ROOT, ".env.example");
const MAX_ATTEMPTS = 3;

function readFlag(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
}

function ensureEnvFile(): void {
  if (existsSync(ENV_PATH)) return;
  if (!existsSync(EXAMPLE_PATH)) {
    console.error("✗ No .env.local and no .env.example to copy from.");
    console.error("  No hay .env.local ni .env.example para copiar.");
    process.exit(1);
  }
  copyFileSync(EXAMPLE_PATH, ENV_PATH);
  console.log("• Created .env.local from .env.example");
  console.log("  Creé .env.local a partir de .env.example\n");
}

/** Reject a value that can't be used, printing why. Shared by both paths. */
function check(value: string, validate: (v: string) => KeyValidation, label: string): boolean {
  const result = validate(value);
  if (!result.ok) {
    console.log(`  ✗ ${label}: ${result.error}`);
    return false;
  }
  if (result.warning) console.log(`  ⚠️  ${result.warning}\n`);
  return true;
}

async function ask(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  validate: (v: string) => KeyValidation,
  label: string,
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const value = sanitizeValue(await rl.question(prompt));
    if (check(value, validate, label)) return value;
    console.log("     try again / inténtalo de nuevo\n");
  }
  console.error("\n✗ Too many invalid attempts. Nothing was changed.");
  console.error("  Demasiados intentos inválidos. No se cambió nada.");
  process.exit(1);
}

function write(keyId: string, secret: string): void {
  let content = readFileSync(ENV_PATH, "utf8");
  content = upsertEnvVar(content, "ALPACA_KEY_ID", keyId);
  content = upsertEnvVar(content, "ALPACA_SECRET_KEY", secret);
  content = upsertEnvVar(content, "ALPACA_PAPER", "true");
  writeFileSync(ENV_PATH, content, "utf8");

  console.log("\n✓ Saved to .env.local / Guardado en .env.local");
  console.log(`    ALPACA_KEY_ID=${maskSecret(keyId)}`);
  console.log(`    ALPACA_SECRET_KEY=${maskSecret(secret)}`);
  console.log("    ALPACA_PAPER=true   ← paper money only / solo dinero ficticio\n");
  console.log("Next / Sigue:");
  console.log("  1. npm run doctor            — verify / verificar");
  console.log("  2. restart npm run dev:all   — reinicia para que tome las claves");
}

async function main() {
  ensureEnvFile();

  const argv = process.argv.slice(2);
  const flagKeyId = readFlag(argv, "--key-id");
  const flagSecret = readFlag(argv, "--secret");

  if (flagKeyId !== null && flagSecret !== null) {
    const keyId = sanitizeValue(flagKeyId);
    const secret = sanitizeValue(flagSecret);
    if (!check(keyId, validateKeyId, "Key ID") || !check(secret, validateSecret, "Secret Key")) {
      process.exit(1);
    }
    write(keyId, secret);
    return;
  }

  console.log("Alpaca paper keys → .env.local");
  console.log("==============================\n");
  console.log("Get them at app.alpaca.markets (switch to Paper Trading → API Keys).");
  console.log("Consíguelas en app.alpaca.markets (cambia a Paper Trading → API Keys).\n");
  console.log("Paste each value and press Enter. / Pega cada valor y presiona Enter.\n");

  const rl = createInterface({ input: stdin, output: stdout });

  // Without this, a closed stdin (piped input that runs out, Ctrl+D) makes
  // the pending question hang forever and Node exits 0 with nothing written
  // — a silent no-op that looks like success. Fail loudly instead.
  let finished = false;
  rl.once("close", () => {
    if (finished) return;
    console.error("\n✗ Input ended before both keys were entered. Nothing was changed.");
    console.error("  La entrada terminó antes de recibir ambas claves. No se cambió nada.");
    process.exit(1);
  });

  try {
    const keyId = await ask(rl, "Key ID (PK…): ", validateKeyId, "Key ID");
    const secret = await ask(rl, "Secret Key: ", validateSecret, "Secret Key");
    write(keyId, secret);
  } finally {
    finished = true;
    rl.close();
  }
}

main();
