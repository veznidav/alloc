import { encodeAbiParameters, encodeFunctionData, parseUnits, type Hex } from "viem";
import { erc20Abi, permit2Abi, universalRouterAbi } from "./abis";
import { publicClient, RH, ZERO_ADDRESS } from "./chains";
import { quoteV4 } from "./robinhood";

export interface PlannedTx { label: string; chainId: number; to: `0x${string}`; data: Hex; value: string }

const CMD_V4_SWAP = "0x10";
const ACTIONS = "0x060c0f" as Hex; // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL

/**
 * Robinhood Chain's UniversalRouter uses the v4 swap struct with one extra field
 * (`minHopPriceX36`) between amountOutMinimum and hookData. Stock Uniswap SDK
 * calldata is one word short and reverts; this encoder includes it (0 = no floor).
 */
function encodeExactInputSingle(p: { currency0: `0x${string}`; currency1: `0x${string}`; fee: number; tickSpacing: number; zeroForOne: boolean; tokenIn: `0x${string}`; tokenOut: `0x${string}`; amountIn: bigint; minOut: bigint; deadline: bigint }): Hex {
  const swap = encodeAbiParameters(
    [{ type: "tuple", components: [
      { type: "tuple", components: [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }] },
      { type: "bool" }, { type: "uint128" }, { type: "uint128" }, { type: "uint256" }, { type: "bytes" } ] }],
    [[[p.currency0, p.currency1, p.fee, p.tickSpacing, ZERO_ADDRESS], p.zeroForOne, p.amountIn, p.minOut, 0n, "0x"]],
  );
  const settle = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [p.tokenIn, p.amountIn]);
  const take = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [p.tokenOut, p.minOut]);
  const input = encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [ACTIONS, [swap, settle, take]]);
  return encodeFunctionData({ abi: universalRouterAbi, functionName: "execute", args: [CMD_V4_SWAP as Hex, [input], p.deadline] });
}

/** Build the on-chain leg: approvals (only if needed) + the USDG → stock swap, for the wallet to sign on Robinhood Chain. */
export async function planLeg2(owner: `0x${string}`, tokenOut: `0x${string}`, usdgHuman: string, slippageBps = 75): Promise<{ txs: PlannedTx[]; expectedOut: string; minOut: string }> {
  const client = publicClient("robinhood");
  const amountIn = parseUnits(Number(usdgHuman).toFixed(6), 6);
  const bal = await client.readContract({ address: RH.USDG, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
  const useAmount = bal < amountIn ? bal : amountIn;
  if (useAmount <= 0n) throw new Error("No USDG has arrived in the wallet on Robinhood Chain yet.");
  const q = await quoteV4(RH.USDG, tokenOut, useAmount);
  if (!q) throw new Error("No on-chain pool with enough depth for this swap right now.");
  const minOut = (q.amountOut * BigInt(10000 - slippageBps)) / 10000n;
  const txs: PlannedTx[] = [];
  const allowance = await client.readContract({ address: RH.USDG, abi: erc20Abi, functionName: "allowance", args: [owner, RH.permit2] });
  if (allowance < useAmount) {
    txs.push({ label: "Allow USDG to be swapped", chainId: 4663, to: RH.USDG, value: "0", data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [RH.permit2, 2n ** 256n - 1n] }) });
  }
  const [p2Amount, p2Exp] = await client.readContract({ address: RH.permit2, abi: permit2Abi, functionName: "allowance", args: [owner, RH.USDG, RH.universalRouter] });
  const now = Math.floor(Date.now() / 1000);
  if (p2Amount < useAmount || Number(p2Exp) <= now) {
    txs.push({ label: "Authorise this swap", chainId: 4663, to: RH.permit2, value: "0", data: encodeFunctionData({ abi: permit2Abi, functionName: "approve", args: [RH.USDG, RH.universalRouter, useAmount, now + 3600] }) });
  }
  const deadline = BigInt(now + 1200);
  txs.push({
    label: "Swap USDG for the stock token", chainId: 4663, to: RH.universalRouter, value: "0",
    data: encodeExactInputSingle({ currency0: q.currency0, currency1: q.currency1, fee: q.fee, tickSpacing: q.tickSpacing, zeroForOne: q.zeroForOne, tokenIn: RH.USDG, tokenOut, amountIn: useAmount, minOut, deadline }),
  });
  return { txs, expectedOut: q.amountOut.toString(), minOut: minOut.toString() };
}
