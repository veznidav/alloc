import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { dexMarket, marketContext } from "@/lib/market";
import { discoverMemes } from "@/lib/memes";
import { ROUTABLE } from "@/lib/robinhood";

export const runtime = "nodejs";

/** A small, fast snapshot for the landing page: market mood plus what is moving on Robinhood Chain. */
export async function GET() {
  try {
    const data = await cached("pulse", 120_000, async () => {
      const [ctx, memes, stocks] = await Promise.all([
        marketContext(),
        discoverMemes().catch(() => []),
        Promise.all(ROUTABLE.slice(0, 12).map(async (a) => ({ symbol: a.symbol, m: await dexMarket("robinhood", a.address).catch(() => null) }))),
      ]);
      const movers = stocks.filter((s) => s.m).map((s) => ({ symbol: s.symbol, change24hPct: s.m!.snapshot.priceChange.h24 ?? 0, kind: "stock" as const }));
      const memeMovers = await Promise.all(memes.slice(0, 5).map(async (m) => ({ symbol: m.symbol, change24hPct: (await dexMarket("robinhood", m.address).catch(() => null))?.snapshot.priceChange.h24 ?? 0, kind: "meme" as const })));
      const all = [...movers, ...memeMovers].sort((a, b) => b.change24hPct - a.change24hPct);
      return { context: ctx, top: all.slice(0, 3), bottom: all.slice(-2).reverse(), stocks: ROUTABLE.length, memes: memes.length };
    });
    return NextResponse.json(data);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
