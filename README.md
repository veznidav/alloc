# Alloc

**Your capital. Three choices. One intelligent allocator.**

Alloc is a capital allocation agent. It watches a crypto position on Ethereum or Base and decides whether the capital should **hold**, **move to a stablecoin**, or **move into a tokenized stock on Robinhood Chain**. Every decision comes with a plain-language explanation, why the other options lost, the real cost of moving, and a simulation or an approvable set of transactions.

Built for the SERV Reasoning hackathon, track *Agents that act on Robinhood Chain*.

## How it works

1. **Read the position.** Token metadata comes from the chain (via public RPC). Price, momentum, liquidity, volume and market cap come from DexScreener and CoinGecko (7d/30d/90d performance, 30d volatility, distance from recent high).
2. **Price the alternatives.**
   - USDC on the same chain, with a live swap quote from Relay for the exact amount Alloc may move.
   - Tokenized stocks on Robinhood Chain from Robinhood's public asset registry. `scripts/scan-universe.ts` scans all ~194 registry assets for a routable USDG pool (Uniswap v4 or v3) and writes `src/data/robinhood-universe.json`. The user's risk profile picks the candidate set: **Conservative** sees index ETFs and mega caps, **Balanced** adds established large caps, **Aggressive** opens the small and mid caps with asymmetric upside, and **Degen** adds meme tokens discovered live from the most active Robinhood Chain pools (GeckoTerminal), with safety floors of at least 3 days of pool age and $200K of liquidity. Memes are routed directly through Relay when it supports the token (one signature), otherwise via USDG and an on-chain pool. For each candidate: on-chain price (DexScreener), Chainlink reference price read on-chain, premium/discount, underlying stock momentum (Yahoo Finance), and an all-in move cost = live Relay quote into USDG + a live on-chain quote (v4 Quoter or v3 QuoterV2) for USDG → stock token.
   - Alloc's scoring model turns this into a modelled edge per alternative: momentum-based expected 30-day return, a volatility term set by the profile (a penalty for Conservative and Balanced, a small convexity bonus for Aggressive), minus the cost of moving, relative to the current asset.
3. **Reason with SERV.** Everything is handed to SERV Reasoning (`inference-api.openserv.ai`, OpenAI-compatible) with the user's preferences and a strict JSON schema. SERV returns the action, target, allocation, expected opportunity, confidence, reasoning steps, a "why not" for every rejected option, and warnings. `serv_prompt_guard` is on; `serv_shadow_agent` can be enabled with `SERV_SHADOW_AGENT=1`.
4. **Simulate or execute.** Playground shows the resulting allocation from a live quote. Real mode builds the exact transactions: Relay for the swap/bridge leg, then either Permit2 + UniversalRouter (Robinhood Chain's v4 fork, with its extra `minHopPriceX36` field) or SwapRouter02 (v3) for USDG → stock. The wallet signs each step; nothing moves without approval unless the user switches to autonomous mode.

While Alloc works, the evidence streams to the screen as it arrives (server-sent events): market context, live route costs, then each candidate with its price, premium and cost. "Compare profiles" runs the same position through all three profiles side by side. The Market page is a live board of every routable stock token on Robinhood Chain.

Decisions, preferences and positions persist on-device (localStorage). Alloc always has the option to do nothing.

## Stack

Next.js 16 (App Router, TypeScript), Tailwind v4, wagmi + viem, zustand, OpenAI SDK pointed at SERV. All data sources are free public APIs; no paid infrastructure.

## Run locally

```bash
pnpm install
cp .env.example .env.local   # add your SERV_API_KEY
pnpm dev
```

## Environment

| Variable | Purpose |
| --- | --- |
| `SERV_API_KEY` | SERV Reasoning API key (required) |
| `SERV_MODEL` | Model id from the SERV catalog (default `gpt-5.4-mini`) |
| `SERV_SHADOW_AGENT` | `1` to enable shadow-agent validation |
| `ETH_RPC_URL`, `BASE_RPC_URL`, `ROBINHOOD_RPC_URL` | Optional RPC overrides |
| `ALLOC_DAILY_LIMIT` | Free decisions per visitor per day on the shared SERV key (default 30; a compare counts 4). Enforced with a signed cookie, no database. |
| `ALLOC_GLOBAL_DAILY_LIMIT` | Soft cap per server instance per day (default 600) |
| `ALLOC_QUOTA_SECRET` | Secret for signing the quota cookie |
| `ALLOC_QUOTA_OFF` | `1` disables the quota (local development) |

## Notes

- Robinhood Chain: chain id 4663. Contracts: USDG `0x5fc5…d168`, Uniswap v4 Quoter `0x8dc1…8f94`, UniversalRouter `0x8876…0904`, Permit2 `0x0000…BA3`.
- Stock Tokens are not offered to U.S., U.K., Canadian or Swiss persons. Alloc surfaces this as a warning; users are responsible for their own eligibility.
