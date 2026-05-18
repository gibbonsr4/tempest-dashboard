"use client";

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { cn } from "@/lib/utils";

/**
 * History-tab time windows fall into three families:
 *
 *   - **short** (≤30 days): `hours`-keyed, served from
 *     `useRecentHistory(hours)` which returns sub-daily bucketed
 *     observations (Tempest's auto-bucketing returns 1-min, 5-min,
 *     30-min, or 3-hour cadence depending on range).
 *
 *   - **long** (≥90 days): `days`-keyed rolling windows, served from
 *     `useDailyAggregates(days)` which returns Tempest's pre-rolled
 *     daily aggregates from the obs_st_ext format. Tempest caps the
 *     long-window endpoint at 730 days (about 2 years).
 *
 *   - **calendar**: explicit `startMs`/`endMs` calendar-aligned
 *     windows (e.g. "last 12 complete months"). Same underlying fetch
 *     as long, but the response is sliced to exact month boundaries
 *     so every monthly-bucket tile carries full-month data. Distinct
 *     from `long` so the rest of the pipeline can still rely on
 *     `range.days` meaning "rolling through now."
 *
 * The three families render through the same chart components but
 * source from different hooks / slices. A single `Range` discriminates
 * which family via the `kind` field.
 */

export type Range =
  | { kind: "short"; label: string; hours: number }
  | { kind: "long"; label: string; days: number }
  | {
      kind: "calendar";
      label: string;
      months: number;
      /** Inclusive station-local start (UTC ms). */
      startMs: number;
      /** Exclusive station-local end (UTC ms) — first ms of the
       *  month AFTER the last complete month, so half-open [start, end). */
      endMs: number;
    };

/**
 * Build the active range list. Takes the station's IANA tz so the
 * YTD + 12mo calculations are anchored to station-local calendar
 * boundaries (the user's actual reference for "this year" and "last
 * 12 months"), not the viewer's tz. Re-build each render so the
 * calendar-derived ranges stay accurate across day boundaries — the
 * old module-level `RANGES = [...]` froze them at page-load time
 * and would silently drift if the tab stayed open across midnight.
 */
export function buildRanges(tz: string, nowMs: number): Range[] {
  return [
    { kind: "short", label: "24h", hours: 24 },
    { kind: "short", label: "7d", hours: 24 * 7 },
    { kind: "short", label: "30d", hours: 24 * 30 },
    { kind: "long", label: "90d", days: 90 },
    { kind: "long", label: "YTD", days: ytdDays(tz, nowMs) },
    { kind: "long", label: "365d", days: 365 },
    { kind: "calendar", label: "12mo", months: 12, ...calendarMonthsBounds(tz, nowMs, 12) },
  ];
}

/**
 * Compute station-local calendar bounds for "last N complete calendar
 * months ending last month." For 12 months in mid-May 2026, returns
 * `{ startMs: May 1 2025 00:00 station-local, endMs: May 1 2026 00:00
 * station-local }`. The end is half-open (first ms of the current
 * month) so the range covers exactly N complete months and never the
 * in-progress current month.
 *
 * Calendar arithmetic is done on the YYYY-MM string in station-tz,
 * NOT raw ms subtraction — month lengths vary, and `subMonths` on a
 * Date object can shift the local-time hour across DST transitions in
 * tz-observing zones. The string-based approach keeps the result
 * unambiguous regardless of when in the year the call happens.
 */
export function calendarMonthsBounds(
  tz: string,
  nowMs: number,
  months: number,
): { startMs: number; endMs: number } {
  const currentMonthLabel = formatInTimeZone(new Date(nowMs), tz, "yyyy-MM");
  // End = first ms of the current month (station-local midnight).
  const endMs = fromZonedTime(
    `${currentMonthLabel}-01T00:00:00`,
    tz,
  ).getTime();
  // Start = first ms of (months) months earlier, via calendar string math.
  const [yStr, mStr] = currentMonthLabel.split("-");
  let y = Number(yStr);
  let m = Number(mStr) - months;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  const startLabel = `${y}-${String(m).padStart(2, "0")}-01T00:00:00`;
  const startMs = fromZonedTime(startLabel, tz).getTime();
  return { startMs, endMs };
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
  if (a.kind === "short") return a.hours === (b as { hours: number }).hours;
  if (a.kind === "long") return a.days === (b as { days: number }).days;
  // calendar — compare by `months`; startMs/endMs drift across midnight
  // as `nowMs` ticks, so ref-equality on bounds isn't safe.
  return a.months === (b as { months: number }).months;
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
        const key =
          r.kind === "short"
            ? `h${r.hours}`
            : r.kind === "long"
              ? `d${r.days}`
              : `m${r.months}`;
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
