import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { walletHoldings } from "@/lib/tokens";
import type { SourceChain } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const chain = u.searchParams.get("chain") as SourceChain;
  const owner = u.searchParams.get("owner") || "";
  if (!["ethereum", "base"].includes(chain) || !isAddress(owner)) return NextResponse.json({ error: "chain and owner required" }, { status: 400 });
  try { return NextResponse.json({ holdings: await walletHoldings(chain, owner) }); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
