import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Daily quota for SERV-backed decisions on the shared key.
 * Per visitor: a tamper-proof signed cookie (no database needed).
 * Per server instance: a soft global cap as a backstop against abuse.
 */
export const DAILY_LIMIT = Number(process.env.ALLOC_DAILY_LIMIT || 30);
const GLOBAL_DAILY_LIMIT = Number(process.env.ALLOC_GLOBAL_DAILY_LIMIT || 600);
const COOKIE = "alloc_q";

function secret() {
  return process.env.ALLOC_QUOTA_SECRET || `alloc:${process.env.SERV_API_KEY || "dev"}`;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}
function parse(req: Request): { day: string; used: number } {
  const raw = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return { day: today(), used: 0 };
  const [payload, sig] = decodeURIComponent(raw).split(".");
  if (!payload || !sig) return { day: today(), used: 0 };
  const expected = sign(payload);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return { day: today(), used: 0 };
  const [day, usedStr] = payload.split("|");
  const used = Number(usedStr);
  if (day !== today() || !Number.isFinite(used)) return { day: today(), used: 0 };
  return { day, used };
}
function serialize(day: string, used: number) {
  const payload = `${day}|${used}`;
  return `${COOKIE}=${encodeURIComponent(`${payload}.${sign(payload)}`)}; Path=/; Max-Age=172800; SameSite=Lax; HttpOnly; Secure`;
}

let globalDay = today();
let globalUsed = 0;

export interface QuotaResult { ok: boolean; remaining: number; limit: number; setCookie?: string; message?: string }

/** Consume `cost` decisions if available. Returns the Set-Cookie header to attach to the response. */
export function consumeQuota(req: Request, cost = 1): QuotaResult {
  if (process.env.ALLOC_QUOTA_OFF === "1") return { ok: true, remaining: DAILY_LIMIT, limit: DAILY_LIMIT };
  if (globalDay !== today()) { globalDay = today(); globalUsed = 0; }
  const { day, used } = parse(req);
  const remaining = Math.max(0, DAILY_LIMIT - used);
  if (used + cost > DAILY_LIMIT) {
    return { ok: false, remaining, limit: DAILY_LIMIT, message: `Daily limit reached: ${DAILY_LIMIT} decisions per day on the shared SERV key. It resets at 00:00 UTC.` };
  }
  if (globalUsed + cost > GLOBAL_DAILY_LIMIT) {
    return { ok: false, remaining, limit: DAILY_LIMIT, message: "Alloc is very busy today and has paused new decisions to keep costs bounded. Please try again later." };
  }
  globalUsed += cost;
  return { ok: true, remaining: Math.max(0, DAILY_LIMIT - used - cost), limit: DAILY_LIMIT, setCookie: serialize(day, used + cost) };
}

export function peekQuota(req: Request): QuotaResult {
  if (process.env.ALLOC_QUOTA_OFF === "1") return { ok: true, remaining: DAILY_LIMIT, limit: DAILY_LIMIT };
  const { used } = parse(req);
  return { ok: used < DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - used), limit: DAILY_LIMIT };
}
