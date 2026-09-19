export type SourceChain = "ethereum" | "base";
export type RiskTolerance = "conservative" | "balanced" | "aggressive";
export type ApprovalMode = "recommend" | "autonomous";
export type Action = "HOLD" | "MOVE_TO_STABLECOIN" | "MOVE_TO_ROBINHOOD";
export type Confidence = "low" | "medium" | "high";

export interface Preferences {
  risk: RiskTolerance;
  minOpportunityPct: number; // only move when expected advantage > this
  maxAllocationPct: number; // never move more than this share of the position
  approvalMode: ApprovalMode;
}

export const RISK_PROFILES: Record<RiskTolerance, { label: string; tagline: string; description: string }> = {
  conservative: { label: "Conservative", tagline: "Protect first", description: "Large caps and index ETFs only. Quick to de-risk into USDC when the position weakens." },
  balanced: { label: "Balanced", tagline: "Steady upside", description: "Large caps, ETFs and established growth names. Moves only on a clear improvement after costs." },
  aggressive: { label: "Aggressive", tagline: "Chase asymmetry", description: "Opens the full Robinhood Chain universe, including small and mid caps with asymmetric upside. Accepts drawdowns for convexity." },
};

export const DEFAULT_PREFERENCES: Preferences = {
  risk: "balanced",
  minOpportunityPct: 5,
  maxAllocationPct: 20,
  approvalMode: "recommend",
};

export interface Momentum {
  change7dPct: number | null;
  change30dPct: number | null;
  change90dPct: number | null;
  volatility30dPct: number | null; // annualised, from daily closes
  fromHigh52wPct: number | null;
  source: "coingecko" | "yahoo";
}

export interface MarketSnapshot {
  priceUsd: number;
  momentum?: Momentum | null;
  priceChange: { h1: number | null; h6: number | null; h24: number | null };
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  txns24h: { buys: number; sells: number } | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  dex: string | null;
  pairAddress: string | null;
  source: "dexscreener" | "coingecko" | "chainlink";
}

export interface PositionInput {
  chain: SourceChain;
  token: string; // contract address or "native"
  amount: string; // human units
}

export interface Position extends PositionInput {
  symbol: string;
  name: string;
  decimals: number;
  isStablecoin: boolean;
  priceUsd: number;
  valueUsd: number;
  market: MarketSnapshot;
  logoUrl?: string | null;
  score?: Score | null;
}

export interface RobinhoodAsset {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  logoUrl: string | null;
  multiplier: number;
  chainlinkFeed: `0x${string}` | null;
}

/** Alloc's transparent scoring model, computed before SERV reasons. */
export interface Score {
  expectedReturn30dPct: number; // momentum-based estimate for the next 30 days
  monthlyVolatilityPct: number;
  riskAdjustedPct: number; // expectedReturn - lambda(risk) * volatility
  advantagePct: number | null; // riskAdjusted(alt) - riskAdjusted(current) - routeCost; null when no route
}

export interface Alternative {
  kind: "stablecoin" | "robinhood";
  score?: Score | null;
  symbol: string;
  name: string;
  address: string;
  chain: "ethereum" | "base" | "robinhood";
  priceUsd: number | null;
  referencePriceUsd: number | null; // Chainlink reference for stock tokens
  premiumPct: number | null; // on-chain price vs reference
  market: MarketSnapshot | null;
  routeCostPct: number | null; // estimated all-in cost to move the proposed amount
  routeDescription: string;
  routeSeconds: number | null;
}

export interface MarketContext {
  ethUsd: number | null;
  ethChange24hPct: number | null;
  btcUsd: number | null;
  btcChange24hPct: number | null;
  totalMarketCapChange24hPct: number | null;
  fetchedAt: string;
}

export interface Decision {
  id: string;
  createdAt: string;
  mode: "playground" | "real";
  position: Position;
  preferences: Preferences;
  action: Action;
  targetSymbol: string | null;
  targetAddress: string | null;
  targetChain: "ethereum" | "base" | "robinhood" | null;
  allocationPct: number; // share of position to move (0 for HOLD)
  amountUsd: number;
  expectedOpportunityPct: number | null;
  estimatedCostPct: number | null;
  estimatedCostUsd: number | null;
  confidence: Confidence;
  headline: string;
  summary: string;
  reasoning: string[];
  whyNot: { option: string; reason: string }[];
  evaluated: string[];
  warnings: string[];
  context: MarketContext;
  alternatives: Alternative[];
  model: string;
  status: "recommended" | "approved" | "rejected" | "executed" | "simulated" | "held";
  executionTxs?: { chainId: number; hash: string; label: string }[];
}

export interface Simulation {
  startingValueUsd: number;
  amountUsd: number;
  amountTokens: number;
  receivedTokens: number | null;
  receivedSymbol: string | null;
  receivedValueUsd: number | null;
  costUsd: number;
  costPct: number;
  resulting: { symbol: string; valueUsd: number; chain: string }[];
  route: string[];
  timeSeconds: number | null;
}

/** Events streamed while Alloc works, so the user can watch the agent gather evidence. */
export type AllocEvent =
  | { type: "stage"; stage: "position" | "market" | "routes" | "reasoning" | "done" }
  | { type: "position"; position: Position }
  | { type: "context"; context: MarketContext }
  | { type: "route"; label: string; costPct: number | null; seconds: number | null; ok: boolean }
  | { type: "candidate"; symbol: string; name: string; priceUsd: number | null; premiumPct: number | null; change24hPct: number | null; hopCostPct: number | null; routable: boolean }
  | { type: "decision"; decision: Decision }
  | { type: "error"; message: string };
