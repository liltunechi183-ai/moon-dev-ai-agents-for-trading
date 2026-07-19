"use client";

import type { ClockState } from "@/hooks/useQuoteStream";

export function MarketStatusPill({ clock }: { clock: ClockState }) {
  if (clock.isOpen === null) {
    return (
      <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-zinc-500">
        Market status unknown
      </span>
    );
  }
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        clock.isOpen
          ? "border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e]"
          : "border-white/10 bg-white/[0.03] text-zinc-400"
      }`}
    >
      {clock.isOpen ? "Market open" : "Market closed"}
    </span>
  );
}
