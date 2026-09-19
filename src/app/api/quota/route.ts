import { NextResponse } from "next/server";
import { peekQuota } from "@/lib/quota";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const q = peekQuota(req);
  return NextResponse.json({ remaining: q.remaining, limit: q.limit });
}
