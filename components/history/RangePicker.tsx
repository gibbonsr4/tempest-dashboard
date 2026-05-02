"use client";

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { cn } from "@/lib/utils";

/**
 * History-tab time windows fall into two families:
 *
 *   - **short** (≤30 days): `hours`-keyed, served from
 *     `useRecentHistory(hours)` which returns sub-daily bucketed
 *     observations (Tempest's auto-bucketing returns 1-min, 5-min,
 *     30-min, or 3-hour cadence depending on range).
 *
 *   - **long** (≥90 days): `days`-keyed, served from
 *     `useDailyAggregates(days)` which returns Tempest's pre-rolled
 *     daily aggregates from the obs_st_ext format. Tempest caps the
 *     long-window endpoint at 730 days (about 2 years).
 *
 * The two families render through the same chart components but
 * source from different hooks. A single `Range` discriminates which
 * family + which size via the `kind` field.
 */

export type Range =
  | { kind: "short"; label: string; hours: number }
  | { kind: "long"; label: string; days: number };

/**
 * Build the active range list. Takes the station's IANA tz so the
 * YTD calculation is anchored to station-local Jan 1 (the user's
 * actual reference for "this year"), not the viewer's tz. Re-build
 * each render so YTD stays accurate across day boundaries — the
 * old module-level `RANGES = [...]` froze YTD at page-load time
 * and would silently drift if the tab stayed open across midnight.
 */
export function buildRanges(tz: string, nowMs: number): Range[] {
  return [
    { kind: "short", label: "24h", hours: 24 },
    { kind: "short", label: "7d", hours: 24 * 7 },
    { kind: "short", label: "30d", hours: 24 * 30 },
    { kind: "long", label: "90d", days: 90 },
    { kind: "long", label: "YTD", days: ytdDays(tz, nowMs) },
    { kind: "long", label: "1y", days: 365 },
  ];
}

/**
 * Days from Jan 1 of the current STATION-LOCAL year through today.
 * Used by the YTD range as the user-facing day count — what the
 * dashboard actually displays.
 *
 * The 181-day floor required by Tempest's `obs_st_ext` daily-
 * aggregate endpoint is applied SEPARATELY at fetch time (see
 * `longFetchDays` in `HistoryClient.tsx`), not here. Mixing the API
 * floor into the user-facing day count caused the YTD chart to
 * render ~181 days for any date earlier than ~Jul 1, mislabelling
 * data from the prior year as "year to date." This function now
 * returns the truthful count; the API call asks for whichever is
 * larger between that count and 181, then slices the response back
 * down to the truthful count for display.
 *
 * Anchor: station-local Jan 1 00:00, converted to a UTC timestamp
 * via `fromZonedTime`. A previous version anchored at `Jan 1
 * 12:00 UTC` for "day-boundary safety" but that broke YTD in
 * timezones west of UTC near the new year — e.g., a user in
 * Sydney (UTC+10) at 8 AM on Jan 1 sees nowMs that's still
 * 2025-12-31 22:00 UTC, which is BEFORE the UTC-noon anchor; the
 * subtraction goes negative and Math.ceil returned 0.
 */
export function ytdDays(tz: string, nowMs: number): number {
  const yearStr = formatInTimeZone(new Date(nowMs), tz, "yyyy");
  // `fromZonedTime` converts the wall-clock string ("2026-01-01
  // 00:00:00") in the specified tz into the corresponding UTC
  // timestamp. Robust to DST and any tz offset.
  const yearStartMs = fromZonedTime(
    `${yearStr}-01-01T00:00:00`,
    tz,
  ).getTime();
  return Math.ceil((nowMs - yearStartMs) / 86_400_000);
}

/**
 * `value` is the active `Range`; the parent owns the state. Comparing
 * by ref isn't safe across re-renders so we compare by `(kind, size)`.
 */
function isSame(a: Range, b: Range): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "short"
    ? a.hours === (b as { hours: number }).hours
    : a.days === (b as { days: number }).days;
}

export function RangePicker({
  ranges,
  value,
  onChange,
}: {
  /** Caller passes the live ranges array (built per-render with the
   * station tz so YTD stays accurate as the year + tab age). */
  ranges: Range[];
  value: Range;
  onChange: (r: Range) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Range"
      className="inline-flex items-center gap-1 rounded-full border bg-card/60 p-0.5 text-xs"
    >
      {ranges.map((r) => {
        const active = isSame(value, r);
        const key = r.kind === "short" ? `h${r.hours}` : `d${r.days}`;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(r)}
            className={cn(
              "rounded-full px-3 py-1 transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
