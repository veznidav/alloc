import { NextResponse } from "next/server";
import { CANDIDATE_SYMBOLS, robinhoodUniverse } from "@/lib/robinhood";

export const runtime = "nodejs";

export async function GET() {
  try {
    const u = await robinhoodUniverse();
    return NextResponse.json({ candidates: u.filter((a) => CANDIDATE_SYMBOLS.includes(a.symbol)), total: u.length });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
