const SECTIONS: Array<{ id: string; title: string; body: string[] }> = [
  {
    id: "accounts",
    title: "0 · Accounts (currently off)",
    body: [
      "Right now the app has no login — it is a personal tool on one computer.",
      "Logins can be turned on later by setting AUTH_ENABLED=true in .env.local and restarting. The first account created becomes the owner. Anyone who signs up after that gets a read-only guest account: they can look at everything but cannot change anything.",
    ],
  },
  {
    id: "dashboard",
    title: "1 · Dashboard",
    body: [
      "The Dashboard tracks two lists. Holdings are stocks you own — you type in how many shares and what you paid, and the app shows your live profit or loss. The Watchlist is any ticker you want the AI to study.",
      "US stocks stream live prices. Stocks from other countries (like TD.TO or 2330.TW) show slightly delayed prices with a 'delayed' tag.",
      "Everything on your Holdings and Watchlist gets researched by the AI every morning.",
    ],
  },
  {
    id: "predictions",
    title: "2 · Predictions",
    body: [
      "For every tracked stock, the AI reads the numbers (trend lines, momentum, volume), the news, company filings, and social chatter — then gives a verdict: bullish (it expects the price up), bearish (down), or neutral (flat), with a confidence from 0 to 10.",
      "Every prediction is saved. When its time horizon passes, the app checks what the price actually did and grades the call right or wrong. The accuracy panel shows the honest score — including whether the AI beats simply always guessing 'up'.",
      "Confidence is capped by history: if calls like this one have only been right 60% of the time, the app lowers the shown confidence to what that record has earned. You'll see the original number struck through.",
      "None of this is financial advice. It is research to help you think.",
    ],
  },
  {
    id: "challenge",
    title: "3 · Challenge the analyst",
    body: [
      "Disagree with a prediction? Open the 'Challenge' box under it and argue. The analyst re-checks the facts on the web, admits it when you're right, and corrects you (politely, with sources) when your numbers are off.",
      "If your argument really changes its mind — the outlook flips or confidence moves by 2 or more — it issues a revised prediction. The old one stays on the record and still gets graded. No erasing history.",
    ],
  },
  {
    id: "trade",
    title: "4 · Trade (paper money)",
    body: [
      "The Trade page is connected to an Alpaca PAPER account: fake money, real market prices. It is completely safe to experiment.",
      "Use the order ticket to buy or sell — by shares or by dollars, at market or with a limit price. You'll always see a confirmation step first.",
      "There is no way to add fake money from the app. To reset the paper account, use the Alpaca website's reset button.",
    ],
  },
  {
    id: "bot",
    title: "5 · The bot",
    body: [
      "The bot trades the paper account automatically using rules you write, like: 'if the AI is bullish at 7 or better AND the chart shows a breakout, buy with a 5% stop-loss.' It checks every 5 minutes while the market is open.",
      "Every buy includes a server-side stop-loss, so the position is protected even if your computer is asleep.",
      "Safety limits: a max per stock, a max total, a daily-loss circuit breaker that shuts the bot off, an orders-per-day cap, and a cooldown per symbol. Every decision — including the ones it blocked — is written to the activity log.",
      "The big red KILL SWITCH disables the bot and cancels its open orders.",
      "Real-money trading is off by default and needs three separate unlocks, including typing a warning sentence by hand. Leave it off.",
    ],
  },
  {
    id: "improve",
    title: "6 · How it improves itself",
    body: [
      "At night the app quizzes the AI on random moments from the past — showing it only the chart data up to that day, never the news — and grades the answers instantly. This builds a big honest test set.",
      "When a prediction turns out wrong, a small AI writes a one-line lesson about why. When enough lessons pile up, a strategist AI proposes ONE careful change to the playbook. The change is tested against the current champion on identical questions, and only promoted if it clearly wins. If a promoted change starts losing in real use, it gets rolled back.",
      "Suggestions that touch the bot's money rules are never applied automatically — they wait in an inbox for you to click Apply or Dismiss.",
    ],
  },
  {
    id: "discoveries",
    title: "7 · Discoveries",
    body: [
      "Once a week, a scout AI reads the week's news and hunts for small, overlooked US stocks the headlines don't name — suppliers to the big story, companies named in government documents, stocks punished too hard for a one-time problem.",
      "Nothing is followed automatically. Each pick lands in an inbox where you Approve (it joins your watchlist) or Dismiss it. Every pick gets graded later either way — including the ones you dismissed, so you learn whether your own instincts add value.",
    ],
  },
];

export default function HowToPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">How TradeS works</h1>
        <p className="mt-1 text-sm text-zinc-500">
          A plain-language guide. Everything here is decision-support research — not financial
          advice.
        </p>
        <nav className="mt-3 flex flex-wrap gap-2 text-xs">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-zinc-400 hover:text-zinc-100"
            >
              {s.title.split("·")[1]?.trim() ?? s.title}
            </a>
          ))}
        </nav>
      </div>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-20">
          <h2 className="mb-2 text-base font-semibold text-zinc-100">{s.title}</h2>
          <div className="flex flex-col gap-2">
            {s.body.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-zinc-400">
                {p}
              </p>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
