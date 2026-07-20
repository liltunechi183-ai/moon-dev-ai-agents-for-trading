import { NextResponse } from "next/server";
import { computeAccuracy, loadGradedRows } from "@/lib/research/accuracy";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(computeAccuracy(loadGradedRows()));
}
