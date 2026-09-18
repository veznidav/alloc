"use client";
import { useEffect, useRef, useState } from "react";

const INTERVAL_MIN = 15;

/** Monitor mode: re-evaluate the position on an interval while the page stays open. */
export function WatchToggle({ onTick, disabled }: { onTick: () => void; disabled?: boolean }) {
  const [on, setOn] = useState(false);
  const [minsLeft, setMinsLeft] = useState(INTERVAL_MIN);
  const cb = useRef(onTick);
  useEffect(() => { cb.current = onTick; }, [onTick]);

  useEffect(() => {
    if (!on) return;
    const started = Date.now();
    const period = INTERVAL_MIN * 60_000;
    const tick = setInterval(() => cb.current(), period);
    const clock = setInterval(() => setMinsLeft(Math.max(0, Math.round((period - ((Date.now() - started) % period)) / 60_000))), 20_000);
    return () => { clearInterval(tick); clearInterval(clock); };
  }, [on]);

  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-ink-2">
      <span className={`relative inline-block h-6 w-10 rounded-full transition-colors ${on ? "bg-ink" : "bg-line-strong"}`}>
        <input type="checkbox" className="peer sr-only" checked={on} disabled={disabled} onChange={(e) => setOn(e.target.checked)} />
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
      <span>{on ? `Watching · next check in ${minsLeft} min` : `Keep watching this position (every ${INTERVAL_MIN} min while open)`}</span>
    </label>
  );
}
