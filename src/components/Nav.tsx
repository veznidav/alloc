"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/playground", label: "Playground" },
  { href: "/real", label: "Real" },
  { href: "/market", label: "Market" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Preferences" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1000px] items-center justify-between gap-3 px-5">
        <Link href="/" className="flex items-center gap-2 text-[1.05rem] font-bold tracking-tight">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-ink" />
          Alloc
        </Link>
        <nav className="flex items-center gap-0.5 overflow-x-auto text-[0.85rem] sm:gap-1 sm:text-[0.9rem]">
          {links.map((l) => {
            const active = path === l.href || (l.href !== "/" && path.startsWith(l.href));
            return (
              <Link key={l.href} href={l.href} className={`whitespace-nowrap rounded-full px-2.5 py-1.5 transition-colors sm:px-3 ${active ? "bg-ink text-white" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
