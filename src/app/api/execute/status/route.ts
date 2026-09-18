import { NextResponse } from "next/server";
import { relayStatus } from "@/lib/relay";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("requestId");
  if (!id) return NextResponse.json({ error: "requestId required" }, { status: 400 });
  try { return NextResponse.json(await relayStatus(id)); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
