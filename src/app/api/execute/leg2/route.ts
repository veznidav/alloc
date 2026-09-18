import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { planLeg2 } from "@/lib/execute";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { user, tokenOut, usdgIn } = (await req.json()) as { user: string; tokenOut: string; usdgIn: string };
    if (!isAddress(user) || !isAddress(tokenOut)) return NextResponse.json({ error: "Invalid addresses." }, { status: 400 });
    const plan = await planLeg2(user, tokenOut, usdgIn);
    return NextResponse.json(plan);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
