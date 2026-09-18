import { NextResponse } from "next/server";
import { planRoute } from "@/lib/simulate";
import type { Decision } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { decision } = (await req.json()) as { decision: Decision };
    const plan = await planRoute(decision);
    return NextResponse.json({ simulation: plan.simulation });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
