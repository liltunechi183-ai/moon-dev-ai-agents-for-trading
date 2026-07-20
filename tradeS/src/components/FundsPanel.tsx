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
        , create paper-account keys, then add them to <code>.env.local</code>:
      </p>
      <pre className="rounded bg-black/30 p-2 text-xs text-zinc-400">
        {`ALPACA_KEY_ID=your_key\nALPACA_SECRET_KEY=your_secret\nALPACA_PAPER=true`}
      </pre>
      <p className="mt-2 text-xs text-zinc-500">
        Restart the app afterwards. Without keys, everything else still works on delayed Yahoo
        data.
      </p>
    </div>
  );
}
