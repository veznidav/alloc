import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { planRoute } from "@/lib/simulate";
import type { Decision } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Real mode: build the signable transactions for a decision (leg 1 via Relay; leg 2 built after funds land). */
export async function POST(req: Request) {
  try {
    const { decision, user } = (await req.json()) as { decision: Decision; user: string };
    if (!isAddress(user)) return NextResponse.json({ error: "Connect a wallet first." }, { status: 400 });
    const plan = await planRoute(decision, user);
    const steps = (plan.relay?.steps ?? []).map((s) => ({
      id: s.id, kind: s.kind, description: s.description, requestId: s.requestId,
      items: s.items.map((i) => ({ status: i.status, data: i.data })),
    }));
    return NextResponse.json({ simulation: plan.simulation, steps, leg2: plan.leg2 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
