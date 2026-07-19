"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/predictions", label: "Predictions" },
  { href: "/discoveries", label: "Discoveries" },
  { href: "/trade", label: "Trade" },
  { href: "/bot", label: "Bot" },
  { href: "/strategy", label: "Strategy" },
  { href: "/howto", label: "How-to" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-white/10 px-4 py-4 text-center text-xs text-zinc-600">
        Decision-support research only. Not financial advice.
      </footer>
    </div>
  );
}
