import { NextResponse } from "next/server";
import { evaluatePosition } from "@/lib/evaluate";
import { resolvePosition } from "@/lib/tokens";
import { DEFAULT_PREFERENCES, type Decision, type PositionInput, type Preferences, type RiskTolerance } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Runs the same position through all three risk profiles so the user can see how the decision changes. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { position: PositionInput; preferences?: Partial<Preferences> };
    const base: Preferences = { ...DEFAULT_PREFERENCES, ...(body.preferences || {}) };
    const position = await resolvePosition(body.position);
    const profiles: RiskTolerance[] = ["conservative", "balanced", "aggressive", "degen"];
    const decisions = await Promise.all(profiles.map((risk) => evaluatePosition(position, { ...base, risk }, "playground").then((d) => ({ risk, decision: d })).catch((e: Error) => ({ risk, error: e.message }))));
    return NextResponse.json({ decisions: decisions as ({ risk: RiskTolerance; decision: Decision } | { risk: RiskTolerance; error: string })[] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
