export const usd = (n: number | null | undefined, opts: { compact?: boolean; decimals?: number } = {}) => {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (opts.compact && abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (opts.compact && abs >= 10_000) return `$${(n / 1_000).toFixed(0)}K`;
  const decimals = opts.decimals ?? (abs < 1 ? 4 : abs < 100 ? 2 : 0);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: decimals, minimumFractionDigits: abs < 1 ? 2 : 0 });
};
export const pct = (n: number | null | undefined, d = 1, signed = true) => {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${signed && n > 0 ? "+" : ""}${n.toFixed(d)}%`;
};
export const num = (n: number | string | null | undefined, max = 4) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 0 : max });
};
export const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
export const when = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};
