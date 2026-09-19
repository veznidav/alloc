import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="space-y-6 pt-6">
        <h1 className="display text-[2.6rem] font-bold sm:text-[3.4rem]">
          Your capital.<br />Three choices.<br />One intelligent allocator.
        </h1>
        <p className="max-w-[60ch] text-[1.1rem] leading-relaxed text-ink-2">
          Alloc watches a crypto position on Ethereum or Base and decides whether it should stay put, move to a stablecoin, or move into a tokenized stock on Robinhood Chain. Every decision comes with the reasoning, the cost, and what happens if you approve.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/playground" className="btn btn-primary">Try a hypothetical position</Link>
          <Link href="/real" className="btn btn-secondary">Connect a wallet</Link>
          <Link href="/market" className="btn btn-secondary">See the market</Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { t: "Hold", d: "No alternative is worth the cost and risk of moving. Nothing happens, and you see why.", c: "pill-hold" },
          { t: "Move to USDC", d: "The current asset has weakened. Part of the position moves to a stablecoin on the same chain.", c: "pill-stable" },
          { t: "Move to Robinhood Chain", d: "A tokenized stock looks sufficiently better after costs. Part of the position moves there.", c: "pill-robinhood" },
        ].map((x) => (
          <div key={x.t} className="card p-5">
            <span className={`pill ${x.c}`}>{x.t}</span>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-2">{x.d}</p>
          </div>
        ))}
      </section>

      <section className="card p-6 sm:p-7">
        <h2 className="text-xl font-bold">How a decision is made</h2>
        <ol className="mt-4 space-y-3 text-[0.95rem] leading-relaxed text-ink-2">
          <li><span className="font-semibold text-ink">Read the position.</span> Live price, momentum, liquidity, volume and market cap for the exact token you hold.</li>
          <li><span className="font-semibold text-ink">Price the alternatives.</span> USDC on your chain, and the tokenized stocks on Robinhood Chain your profile allows, from index ETFs to small caps, each with its on-chain price, Chainlink reference price and a real quote for moving your amount.</li>
          <li><span className="font-semibold text-ink">Reason with SERV.</span> SERV Reasoning weighs opportunity against cost and risk under your preferences and returns a decision, a plain explanation, and why the other options lost.</li>
          <li><span className="font-semibold text-ink">Simulate or approve.</span> Playground shows the resulting allocation. Real mode prepares the transactions and waits for you.</li>
        </ol>
      </section>
    </div>
  );
}
