/**
 * Shared period-boundary + period-sum helpers used by the Now-tab
 * adaptive cards (rain, lightning) to derive yesterday / 7-day /
 * month totals from the bucketed history payload.
 *
 * Centralizes two things that were independently re-derived in each
 * card and DST-fragile in the process:
 *
 *   1. **Boundaries** are computed via `startOfStationDay` on
 *      `nowMs ± 86_400_000`, NOT by adding/subtracting raw 24-hour
 *      ms offsets to/from `todayStart`. On DST transition days the
 *      station's calendar day is 23 or 25 wall-clock hours, so
 *      `todayStart - 86_400_000` will land an hour off.
 *      `startOfStationDay` snaps to whatever the actual previous /
 *      next station-local midnight is.
 *
 *   2. **Reductions** walk the sample list once and accumulate four
 *      window totals in parallel, instead of each card re-implementing
 *      the same loop with subtle differences.
 */

import { formatInTimeZone } from "date-fns-tz";
import { startOfStationDay } from "./format";

export interface PeriodBoundaries {
  todayStart: number;
  yesterdayStart: number;
  monthStart: number;
}

/**
 * Station-day boundaries derived in the station's tz, DST-safe.
 *
 * `nowMs` should be the live "now" used elsewhere in the card so the
 * reduction stays in lock-step with whatever drives re-renders
 * (typically `useNow()`).
 */
export function computePeriodBoundaries(
  nowMs: number,
  tz: string,
): PeriodBoundaries {
  const todayStart = startOfStationDay(nowMs, tz);
  // Snap to yesterday's actual local midnight via tz arithmetic
  // rather than subtracting 24h from todayStart — the latter is off
  // by an hour on spring-forward / fall-back days.
  const yesterdayStart = startOfStationDay(nowMs - 86_400_000, tz);
  // Month start derived from the station-local YYYY-MM. We anchor
  // the parse at UTC noon so any tz offset still resolves to the
  // intended calendar day, then snap through `startOfStationDay`.
  const monthStartYmd = formatInTimeZone(new Date(nowMs), tz, "yyyy-MM-01");
  const monthStart = startOfStationDay(
    new Date(`${monthStartYmd}T12:00:00Z`).getTime(),
    tz,
  );
  return { todayStart, yesterdayStart, monthStart };
}

export interface PeriodTotals {
  today: number;
  yesterday: number;
  month: number;
}

/**
 * Single-pass reduction over `samples`, summing values per period
 * defined by `bounds`. `valueFn` extracts the per-sample value
 * (e.g., `s => s.rainMm` or `s => s.lightningStrikeCount`); samples
 * with non-finite values are skipped.
 *
 * Returns `null` when no samples contribute any finite value (so
 * the caller can render "—" rather than misleading zeros). When
 * samples exist but contain only zeros, returns zeros — that's a
 * meaningful "we have data, it's just dry / quiet" signal.
 */
export function sumSamplesByPeriod<S extends { ts: number }>(
  samples: S[] | null | undefined,
  bounds: PeriodBoundaries,
  valueFn: (s: S) => number | null | undefined,
): PeriodTotals | null {
  if (!samples || samples.length === 0) return null;
  let today = 0;
  let yesterday = 0;
  let month = 0;
  let touched = false;
  for (const s of samples) {
    const v = valueFn(s);
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    touched = true;
    if (s.ts >= bounds.todayStart) today += v;
    if (s.ts >= bounds.yesterdayStart && s.ts < bounds.todayStart) {
      yesterday += v;
    }
    if (s.ts >= bounds.monthStart) month += v;
  }
  return touched ? { today, yesterday, month } : null;
}
