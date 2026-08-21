export function FundsPanel() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-400">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Paper funds
      </h2>
      <p>
        There is no API to add or reset paper money. To reset the paper account (balance and
        history), open the{" "}
        <a
          href="https://app.alpaca.markets/"
          target="_blank"
          rel="noreferrer"
          className="text-[#38bdf8] hover:underline"
        >
          Alpaca dashboard
        </a>{" "}
        and use its paper-account reset. The app picks up the new balance automatically.
      </p>
    </div>
  );
}

export function SetupPanel() {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-zinc-300">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-500">
        Trading not configured
      </h2>
      <p className="mb-2">
        Paper trading needs free Alpaca API keys. Sign up at{" "}
        <a
          href="https://app.alpaca.markets/signup"
          target="_blank"
          rel="noreferrer"
          className="text-[#38bdf8] hover:underline"
        >
          alpaca.markets
        </a>
        , switch to <strong>Paper Trading</strong>, and create API keys. Then run this in the
        project folder — it asks for the two keys and writes them for you:
      </p>
      <pre className="rounded bg-black/30 p-2 text-xs text-zinc-400">npm run alpaca:keys</pre>
      <p className="mt-2 text-xs text-zinc-500">
        Prefer editing by hand? Put <code>ALPACA_KEY_ID</code>, <code>ALPACA_SECRET_KEY</code> and{" "}
        <code>ALPACA_PAPER=true</code> in <code>.env.local</code> yourself. Either way, restart the
        app afterwards. Without keys, everything else still works on delayed Yahoo data.
      </p>
    </div>
  );
}
