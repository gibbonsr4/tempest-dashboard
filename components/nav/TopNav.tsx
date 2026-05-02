"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { Clock } from "@/components/shared/Clock";
import { ConnectionPill } from "@/components/shared/ConnectionPill";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useStationMeta } from "@/lib/hooks/useStationMeta";

const TABS = [
  { href: "/", label: "Now" },
  { href: "/radar", label: "Radar" },
  { href: "/history", label: "History" },
] as const;

/**
 * Sticky top navigation. Brand mark on the left, tab links centered,
 * status + preference cluster on the right. Active tab is underlined
 * with the copper accent rather than filled — keeps the bar visually
 * quiet so the dashboard cards lead.
 *
 * The station name comes from the same `useStationMeta()` query the
 * AppShell already drives, so this is a cache-hit, not a fresh fetch.
 */
export function TopNav() {
  const pathname = usePathname();
  const meta = useStationMeta();
  const stationName = meta.data?.stationName;
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:gap-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium tracking-tight">
          <Cloud className="size-4 text-primary" aria-hidden />
          <span className="hidden sm:inline">Tempest</span>
          {stationName && (
            <span className="hidden text-muted-foreground sm:inline">
              · {stationName}
            </span>
          )}
        </Link>

        <nav className="flex min-w-0 flex-1 items-center justify-center gap-1">
          {TABS.map((tab) => {
            const active =
              tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "relative rounded-md px-3 py-3 text-sm transition-colors sm:py-1.5",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 -bottom-px h-px bg-primary"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Clock className="hidden sm:inline-flex" />
          <ConnectionPill />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
