import { NextResponse } from "next/server";
import { resolvePosition } from "@/lib/tokens";
import type { PositionInput } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PositionInput;
    if (!["ethereum", "base"].includes(body.chain)) return NextResponse.json({ error: "Choose Ethereum or Base." }, { status: 400 });
    const position = await resolvePosition({ chain: body.chain, token: String(body.token || "").trim(), amount: String(body.amount) });
    return NextResponse.json({ position });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
