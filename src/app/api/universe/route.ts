import { NextResponse } from "next/server";
import { ROUTABLE, scanCandidates, tierOf, UNIVERSE_SCANNED_AT } from "@/lib/robinhood";
import { cached } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Live board of every routable stock token on Robinhood Chain. */
export async function GET() {
  try {
    const rows = await cached("rh:board", 90_000, () => scanCandidates(1000, ROUTABLE.slice(0, 40)));
    return NextResponse.json({
      scannedAt: UNIVERSE_SCANNED_AT,
      total: ROUTABLE.length,
      assets: rows.map((c) => ({
        symbol: c.asset.symbol, name: c.asset.name, address: c.asset.address, logoUrl: c.asset.logoUrl, tier: tierOf(c.asset.symbol),
        priceUsd: c.priceUsd, referencePriceUsd: c.referencePriceUsd, premiumPct: c.premiumPct,
        change24hPct: c.market?.priceChange.h24 ?? null, change30dPct: c.market?.momentum?.change30dPct ?? null, volatility30dPct: c.market?.momentum?.volatility30dPct ?? null,
        liquidityUsd: c.market?.liquidityUsd ?? null, volume24hUsd: c.market?.volume24hUsd ?? null, hopCostPct: c.hopCostPct, protocol: c.hopQuote?.protocol ?? null,
      })),
    });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
