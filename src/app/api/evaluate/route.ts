import { NextResponse } from "next/server";
import { evaluatePosition } from "@/lib/evaluate";
import { resolvePosition } from "@/lib/tokens";
import { DEFAULT_PREFERENCES, type Position, type PositionInput, type Preferences } from "@/lib/types";
import { consumeQuota } from "@/lib/quota";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const quota = consumeQuota(req, 1);
  if (!quota.ok) return NextResponse.json({ error: quota.message, quota: { remaining: quota.remaining, limit: quota.limit } }, { status: 429 });
  try {
    const body = (await req.json()) as { position: PositionInput | Position; preferences?: Partial<Preferences>; mode?: "playground" | "real" };
    const prefs: Preferences = { ...DEFAULT_PREFERENCES, ...(body.preferences || {}) };
    prefs.maxAllocationPct = Math.min(100, Math.max(1, Number(prefs.maxAllocationPct) || 20));
    prefs.minOpportunityPct = Math.max(0, Number(prefs.minOpportunityPct) || 0);
    // Always refresh the position against live data before deciding.
    const position = await resolvePosition({ chain: body.position.chain, token: body.position.token, amount: body.position.amount });
    const decision = await evaluatePosition(position, prefs, body.mode === "real" ? "real" : "playground");
    return NextResponse.json({ decision, quota: { remaining: quota.remaining, limit: quota.limit } }, { headers: quota.setCookie ? { "set-cookie": quota.setCookie } : {} });
  } catch (e) {
    console.error("evaluate failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
