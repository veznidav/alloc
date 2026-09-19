import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { planRoute } from "@/lib/simulate";
import { formatUnits, parseEther } from "viem";
import { publicClient, RH, ZERO_ADDRESS, CHAIN_IDS } from "@/lib/chains";
import { erc20Abi } from "@/lib/abis";
import { relayQuote } from "@/lib/relay";
import type { Decision } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Real mode: build the signable transactions for a decision (leg 1 via Relay; leg 2 built after funds land). */
export async function POST(req: Request) {
  try {
    const { decision, user } = (await req.json()) as { decision: Decision; user: string };
    if (!isAddress(user)) return NextResponse.json({ error: "Connect a wallet first." }, { status: 400 });
    const plan = await planRoute(decision, user);
    const mapSteps = (q: { steps: { id: string; kind: string; description: string; requestId?: string; items: { status: string; data: unknown }[] }[] } | null) =>
      (q?.steps ?? []).map((s) => ({ id: s.id, kind: s.kind, description: s.description, requestId: s.requestId, items: s.items.map((i) => ({ status: i.status, data: i.data })) }));
    const steps = mapSteps(plan.relay);

    // Preflight on Robinhood Chain: the on-chain leg needs a little ETH for gas there.
    let preflight = null;
    if (plan.leg2) {
      const rh = publicClient("robinhood");
      const [eth, usdg] = await Promise.all([
        rh.getBalance({ address: user }).catch(() => 0n),
        rh.readContract({ address: RH.USDG, abi: erc20Abi, functionName: "balanceOf", args: [user] }).catch(() => 0n),
      ]);
      const MIN_GAS = parseEther("0.0001");
      const needsGas = eth < MIN_GAS;
      let gasTopUp: ReturnType<typeof mapSteps> = [];
      let gasTopUpUsd: number | null = null;
      if (needsGas) {
        try {
          const q = await relayQuote({ user, originChainId: CHAIN_IDS[decision.position.chain], destinationChainId: 4663, originCurrency: ZERO_ADDRESS, destinationCurrency: ZERO_ADDRESS, amount: parseEther("0.0004").toString() });
          gasTopUp = mapSteps(q);
          gasTopUpUsd = Number(q.details.currencyIn.amountUsd);
        } catch { /* no top-up route; the UI will explain */ }
      }
      preflight = { rhEth: formatUnits(eth, 18), rhUsdg: formatUnits(usdg, 6), needsGas, gasTopUp, gasTopUpUsd, resumable: usdg > 0n };
    }
    return NextResponse.json({ simulation: plan.simulation, steps, leg2: plan.leg2, preflight });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
