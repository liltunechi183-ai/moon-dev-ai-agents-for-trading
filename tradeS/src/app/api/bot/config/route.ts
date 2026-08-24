import { NextResponse } from "next/server";
import { z } from "zod";
import { getBotConfig, setBotConfig, isLiveAckValid, LIVE_ACK_SENTENCE } from "@/lib/bot/config";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getBotConfig();
  return NextResponse.json({
    config,
    liveAckValid: isLiveAckValid(config),
    liveAckSentence: LIVE_ACK_SENTENCE,
    paper: env.paper,
    allowLiveEnv: env.allowLive,
  });
}

const patchSchema = z
  .object({
    enabled: z.boolean(),
    maxPositionUsd: z.number().positive().max(1_000_000),
    maxTotalExposureUsd: z.number().positive().max(10_000_000),
    maxDailyLossUsd: z.number().positive().max(1_000_000),
    maxOrdersPerDay: z.number().int().min(1).max(200),
    cooldownMinutes: z.number().min(0).max(10_080),
    minConfidence: z.number().int().min(0).max(10),
    liveAck: z.string().max(200),
    budgetUsd: z.number().positive().max(10_000_000),
    cashReservePct: z.number().min(0).max(0.9),
    maxSlicePct: z.number().min(0.01).max(1),
    primerSaltoEnabled: z.boolean(),
    primerSaltoNotionalUsd: z.number().positive().max(1_000_000),
  })
  .partial();

export async function PUT(request: Request) {
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  setBotConfig(parsed.data);
  return NextResponse.json({ config: getBotConfig() });
}
