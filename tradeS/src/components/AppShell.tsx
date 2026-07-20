"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageProvider, useI18n } from "@/lib/i18n/provider";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/config";

const NAV_LINKS = [
  { href: "/", key: "nav.dashboard" },
  { href: "/predictions", key: "nav.predictions" },
  { href: "/discoveries", key: "nav.discoveries" },
  { href: "/trade", key: "nav.trade" },
  { href: "/bot", key: "nav.bot" },
  { href: "/strategy", key: "nav.strategy" },
  { href: "/howto", key: "nav.howto" },
];

function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  // Data-driven: hides itself while only the base language is configured.
  if (SUPPORTED_LANGUAGES.length < 2) return null;
  return (
    <div className="flex gap-1">
      {SUPPORTED_LANGUAGES.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          className={`rounded px-2 py-1 text-xs ${
            lang === l.code ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <ShellInner>{children}</ShellInner>
    </LanguageProvider>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0e14]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-wide text-zinc-100">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#22c55e]" />
            TradeS
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
            {NAV_LINKS.map((link) => {
              const active =
                link.href === "/" ? pathname === "/" : pathname?.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 whitespace-nowrap transition-colors ${
                    active
                      ? "bg-white/10 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
                  }`}
                >
                  {t(link.key)}
                </Link>
              );
            })}
          </nav>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-white/10 px-4 py-4 text-center text-xs text-zinc-600">
        {t("common.notAdvice")}
      </footer>
    </div>
  );
}
