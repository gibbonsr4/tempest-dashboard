"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
 * Brand mark — inline SVG of the same Microsoft Fluent UI "weather
 * rain showers day" glyph used by `app/icon.svg` (the favicon /
 * PWA icon), but rendered without the copper rounded-square
 * background tile. `fill="currentColor"` makes the glyph inherit
 * the surrounding text color (here, `text-primary`, the copper
 * accent), so the mark stays themed in both light and dark mode.
 *
 * Inline rather than `<img src="/icon.svg" />` because the file
 * version bakes in the copper background tile, which we don't want
 * inside the nav. Paths are kept in sync by hand — if you redesign
 * the icon, update both `app/icon.svg` and the path below.
 */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M368.3,240.3c5.3-10.7,8.1-22.5,8.1-34.6,0-43.2-35.1-78.4-78.4-78.4s-49.8,12.8-64.3,33.7c-.9,0-1.9-.1-2.8-.1-42.9,0-79.6,28.1-91.3,68.2-3.2-.6-6.6-1-9.4-1-33.9,0-61.6,27.6-61.6,61.6s27.6,61.6,61.6,61.6,11.2-5,11.2-11.2-5-11.2-11.2-11.2c-21.6,0-39.2-17.6-39.2-39.2s17.6-39.2,39.2-39.2,4,.4,6.7.9v10.3c0,6.2,5,11.2,11.2,11.2s11.2-5,11.2-11.2v-18c6-35,36-60.3,71.7-60.3s65.7,25.3,71.7,60.3v18c0,6.2,5,11.2,11.2,11.2s11.2-5,11.2-11.2v-10.3c2.6-.5,5.1-.9,6.7-.9,21.6,0,39.2,17.6,39.2,39.2s-17.6,39.2-39.2,39.2-11.2,5-11.2,11.2,5,11.2,11.2,11.2c33.9,0,61.6-27.6,61.6-61.6s-9.8-38.1-24.9-49.3ZM322.1,229c-9-30.8-32.8-54.5-62.7-63.8,10.3-9.8,24-15.6,38.6-15.6,30.9,0,56,25.1,56,56s-2,17.1-5.8,24.7c-5.3-1.5-10.8-2.3-16.6-2.3s-6.2.4-9.5,1Z" />
      <path d="M298,104.9c6.2,0,11.2-5,11.2-11.2v-22.4c0-6.2-5-11.2-11.2-11.2s-11.2,5-11.2,11.2v22.4c0,6.2,5,11.2,11.2,11.2Z" />
      <path d="M432.3,194.4h-22.4c-6.2,0-11.2,5-11.2,11.2s5,11.2,11.2,11.2h22.4c6.2,0,11.2-5,11.2-11.2s-5-11.2-11.2-11.2Z" />
      <path d="M377.1,137.7c2.9,0,5.7-1.1,7.9-3.3l15.8-15.8c4.4-4.4,4.4-11.5,0-15.8-4.4-4.4-11.5-4.4-15.8,0l-15.8,15.8c-4.4,4.4-4.4,11.5,0,15.8,2.2,2.2,5,3.3,7.9,3.3Z" />
      <path d="M210.9,134.4c2.2,2.2,5,3.3,7.9,3.3s5.7-1.1,7.9-3.3c4.4-4.4,4.4-11.5,0-15.8l-15.8-15.8c-4.4-4.4-11.5-4.4-15.8,0s-4.4,11.5,0,15.8l15.8,15.8Z" />
      <path d="M239.1,295.5c-6-1.5-12.1,2.1-13.6,8.1l-33.6,134.3c-1.5,6,2.1,12.1,8.1,13.6.9.2,1.8.3,2.7.3,5,0,9.6-3.4,10.8-8.5l33.6-134.3c1.5-6-2.1-12.1-8.1-13.6Z" />
      <path d="M283.9,329.1c-6-1.5-12.1,2.1-13.6,8.1l-16.8,67.2c-1.5,6,2.1,12.1,8.1,13.6.9.2,1.8.3,2.7.3,5,0,9.6-3.4,10.8-8.5l16.8-67.2c1.5-6-2.1-12.1-8.1-13.6Z" />
      <path d="M177.6,329.1c-6-1.5-12.1,2.1-13.6,8.1l-16.8,67.2c-1.5,6,2.1,12.1,8.1,13.6.9.2,1.8.3,2.7.3,5,0,9.6-3.4,10.8-8.5l16.8-67.2c1.5-6-2.1-12.1-8.1-13.6Z" />
    </svg>
  );
}

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
    <header className="sticky top-0 z-30 border-b bg-background pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:gap-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm font-medium tracking-tight"
        >
          {/* BrandMark sized larger than the title text
              (`text-sm` ≈ 14px, mark at `size-6` = 24px) so the
              logotype reads as a tight unit. The mark falls back
              to "Tempest" copy when the station name hasn't loaded
              yet (and during config-error states), so the brand
              identifier is always visible. */}
          <BrandMark className="size-6 text-primary" />
          <span className="hidden sm:inline">{stationName ?? "Tempest"}</span>
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
