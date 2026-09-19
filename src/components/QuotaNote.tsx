"use client";
import { useQuery } from "@tanstack/react-query";

/** How many decisions the visitor has left today on the shared SERV key. */
export function QuotaNote() {
  const { data } = useQuery({ queryKey: ["quota"], queryFn: async () => (await fetch("/api/quota")).json() as Promise<{ remaining: number; limit: number }>, staleTime: 10_000 });
  if (!data) return null;
  const low = data.remaining <= 5;
  return (
    <span className={`text-sm ${low ? "text-warn" : "text-ink-3"}`}>
      {data.remaining === 0 ? "Daily limit reached. Resets at 00:00 UTC." : `${data.remaining} of ${data.limit} free decisions left today.`}
    </span>
  );
}
