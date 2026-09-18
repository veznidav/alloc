import { CHAIN_LABELS } from "@/lib/chains";
import { num, pct, usd } from "@/lib/format";
import type { Position } from "@/lib/types";

export function PositionSummary({ position, compact }: { position: Position; compact?: boolean }) {
  const m = position.market;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="display text-[2rem] font-bold tnum sm:text-[2.4rem]">{num(position.amount)} {position.symbol}</span>
        <span className="text-[1.15rem] font-semibold tnum text-ink-2">{usd(position.valueUsd)}</span>
      </div>
      <p className="mt-1 text-[0.95rem] text-ink-2">
        {position.name} on {CHAIN_LABELS[position.chain]} at {usd(position.priceUsd)} per token
      </p>
      {!compact && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[0.9rem] sm:grid-cols-5">
          <Stat label="24h change" value={pct(m.priceChange.h24)} tone={m.priceChange.h24 ?? 0} />
          <Stat label="30d change" value={pct(m.momentum?.change30dPct)} tone={m.momentum?.change30dPct ?? 0} />
          <Stat label="24h volume" value={usd(m.volume24hUsd, { compact: true })} />
          <Stat label="Liquidity" value={usd(m.liquidityUsd, { compact: true })} />
          <Stat label="Market cap" value={usd(m.marketCapUsd ?? m.fdvUsd, { compact: true })} />
        </dl>
      )}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const color = tone == null ? "text-ink" : tone > 0 ? "text-robinhood" : tone < 0 ? "text-danger" : "text-ink";
  return (
    <div>
      <dt className="text-ink-3">{label}</dt>
      <dd className={`mt-0.5 font-semibold tnum ${color}`}>{value}</dd>
    </div>
  );
}
