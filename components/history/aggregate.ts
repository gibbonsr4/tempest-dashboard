/**
 * Daily aggregation helpers for the History tab. At ranges longer than
 * a day, plotting every raw observation (bucket) just shows the same
 * diurnal cycle repeating — useful at 24h, noise at 7d / 30d. The
 * standard meteorology fix is to aggregate to daily values: high, low,
 * mean, total, or "max-of-day" depending on metric.
 *
 * The station's IANA tz string is passed in by the caller (resolved
 * from `useStationMeta().timezone` via the TzProvider context). Day
 * boundaries anchor at station-local midnight, derived per-instant by
 * `startOfStationDay` so DST transitions are handled correctly.
 *
 * Output materializes a row for *every* day in the input range — days
 * with no contributing samples get `count: 0` and null fields. That
 * lets chart consumers render visible gaps for outage days instead of
 * compressing the x-axis (which would otherwise hide partial failures).
 */

import { formatInTimeZone } from "date-fns-tz";
import type { HistorySample } from "@/lib/hooks/useRecentHistory";
import type { DeviceDailyAggregate } from "@/lib/tempest/server-client";
import { startOfStationDay } from "@/lib/tempest/format";

export interface DailyAggregate {
  /** Epoch ms at local midnight (start of the bucket day) in the station's tz. */
  ts: number;
  /** Minimum value seen on this day, or null when the metric had no data. */
  min: number | null;
  /** Maximum value seen on this day. */
  max: number | null;
  /** Arithmetic mean across the day's samples. */
  mean: number | null;
  /** Sum across the day's samples. Useful only for accumulations (rain). */
  sum: number | null;
  /** How many samples contributed. `0` ⇒ outage day; null fields. */
  count: number;
}

/**
 * Group samples by their station-local-zone day boundary and compute
 * per-day min / max / mean / sum for the supplied projector. The
 * projector returns the numeric value to aggregate (or null to skip
 * a sample).
 *
 * Days between the first and last sample with no valid contributions
 * still get a row in the output (with `count: 0` and null fields), so
 * chart consumers see explicit gaps rather than a silently compressed
 * timeline.
 */
export function aggregateByDay(
  samples: HistorySample[],
  pick: (s: HistorySample) => number | null,
  tz: string,
): DailyAggregate[] {
  if (samples.length === 0) return [];

  const buckets = new Map<string, { ts: number; values: number[] }>();
  let firstTs = Infinity;
  let lastTs = -Infinity;

  for (const s of samples) {
    if (s.ts < firstTs) firstTs = s.ts;
    if (s.ts > lastTs) lastTs = s.ts;
    const v = pick(s);
    if (v == null || !Number.isFinite(v)) continue;
    // Use the station-local Y/M/D as the bucket key. Two samples with
    // the same key are guaranteed to fall on the same local day, even
    // across DST transitions.
    const key = formatInTimeZone(new Date(s.ts), tz, "yyyy-MM-dd");
    const dayStart = startOfStationDay(s.ts, tz);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { ts: dayStart, values: [] };
      buckets.set(key, bucket);
    }
    bucket.values.push(v);
  }

  if (!Number.isFinite(firstTs)) return [];

  // Walk every station-local day in the input range, in order. For each
  // day, emit either the populated bucket or a `count: 0` placeholder.
  const out: DailyAggregate[] = [];
  let cur = startOfStationDay(firstTs, tz);
  const lastDayStart = startOfStationDay(lastTs, tz);

  // Hard cap to keep a malformed input from spinning forever — at 30h
  // step we'd cover ~5 years before we hit the cap.
  for (let i = 0; i < 1825 && cur <= lastDayStart; i++) {
    const key = formatInTimeZone(new Date(cur), tz, "yyyy-MM-dd");
    const bucket = buckets.get(key);
    if (bucket && bucket.values.length > 0) {
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      for (const v of bucket.values) {
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
      }
      out.push({
        ts: bucket.ts,
        min,
        max,
        mean: sum / bucket.values.length,
        sum,
        count: bucket.values.length,
      });
    } else {
      out.push({
        ts: cur,
        min: null,
        max: null,
        mean: null,
        sum: null,
        count: 0,
      });
    }
    // Advance ~30h into the next day, then re-anchor to that day's
    // midnight. The 30h offset crosses any DST transition cleanly;
    // `startOfStationDay` then snaps back to the next day's start.
    cur = startOfStationDay(cur + 30 * 3600 * 1000, tz);
  }

  return out;
}

/**
 * Tempest's `obs_st_ext` rows are already daily-aggregated server-side
 * (one row per station-local calendar day with min/avg/max + sum
 * fields per metric). This adapter reshapes them into the same
 * `DailyAggregate` interface that `aggregateByDay` produces, so the
 * existing `DailyAggregateChart` can consume long-window data without
 * a parallel chart implementation.
 *
 * The picker function selects which fields on the `DeviceDailyAggregate`
 * row to use — e.g. for temperature you'd return `{ min: tempMinC,
 * max: tempMaxC, mean: tempAvgC, sum: null }`. Returning `null` for any
 * of the four fields signals "this metric doesn't have that aggregation"
 * (e.g. rain doesn't have a meaningful daily mean; temp doesn't have
 * a meaningful daily sum).
 *
 * Rows where `recordCountMinutes` is very low (<60) are kept but the
 * `count` field reflects the actual minutes recorded. Chart consumers
 * already handle low-count days as the partial-data signal.
 */
export function fromDailyAggregates(
  rows: DeviceDailyAggregate[],
  pick: (row: DeviceDailyAggregate) => {
    min: number | null;
    max: number | null;
    mean: number | null;
    sum: number | null;
  },
  tz: string,
): DailyAggregate[] {
  if (rows.length === 0) return [];

  // Index input rows by their station-local YYYY-MM-DD key for O(1)
  // lookup as we walk every day in the range.
  const byDate = new Map<string, DeviceDailyAggregate>();
  for (const row of rows) byDate.set(row.date, row);

  // Walk every station-local day from the first input row to the
  // last, mirroring `aggregateByDay`'s gap-day pattern: missing
  // dates emit a `count: 0` placeholder with null fields. Without
  // this, dropped rows from `getDeviceDailyAggregates`'s per-row
  // try/catch (or any genuine sensor outage that Tempest itself
  // omits) would silently render as bridged lines instead of the
  // explicit breaks `DailyAggregateChart` expects (no `connectNulls`
  // → null values break the line).
  const out: DailyAggregate[] = [];
  let cur = startOfStationDay(
    new Date(`${rows[0].date}T12:00:00Z`).getTime(),
    tz,
  );
  const last = startOfStationDay(
    new Date(`${rows[rows.length - 1].date}T12:00:00Z`).getTime(),
    tz,
  );

  // Hard cap to keep a malformed input from spinning forever — at 30h
  // step we'd cover ~5 years before we hit the cap. Same defensive
  // bound `aggregateByDay` uses.
  for (let i = 0; i < 1825 && cur <= last; i++) {
    const key = formatInTimeZone(new Date(cur), tz, "yyyy-MM-dd");
    const row = byDate.get(key);
    if (row) {
      const v = pick(row);
      out.push({
        ts: cur,
        min: v.min,
        max: v.max,
        mean: v.mean,
        sum: v.sum,
        count: row.recordCountMinutes ?? 0,
      });
    } else {
      out.push({
        ts: cur,
        min: null,
        max: null,
        mean: null,
        sum: null,
        count: 0,
      });
    }
    // Advance ~30h then re-anchor to the next day's midnight. The
    // 30h offset cleanly crosses any DST transition; `startOfStationDay`
    // snaps back to the next day's local midnight.
    cur = startOfStationDay(cur + 30 * 3600 * 1000, tz);
  }

  return out;
}

/**
 * Apply a centered N-day moving average to a `DailyAggregate[]`,
 * smoothing the series for visual clarity at long range without
 * changing semantics (each output day is the avg of the N-day
 * window centered on it). Outage days (count: 0) are skipped from
 * the window's contribution but the smoothed output day still
 * gets a value as long as the window has at least one valid day.
 *
 * Defaults to 7 days — long enough to flatten day-to-day weather
 * noise on year-scale charts, short enough to preserve seasonal
 * shape and storm-week peaks.
 *
 * Returns the input unchanged if `windowSize <= 1` so callers can
 * conditionally enable smoothing without branching at every
 * call site.
 */
export function smoothDailyAggregates(
  rows: DailyAggregate[],
  windowSize = 7,
): DailyAggregate[] {
  if (windowSize <= 1 || rows.length === 0) return rows;
  const half = Math.floor(windowSize / 2);
  return rows.map((row, i) => {
    let sumMin = 0;
    let sumMax = 0;
    let sumMean = 0;
    let cMin = 0;
    let cMax = 0;
    let cMean = 0;
    const start = Math.max(0, i - half);
    const end = Math.min(rows.length, i + half + 1);
    // Sum-style metrics (rain) intentionally bypass the smoothing
    // window — see the `sum: row.sum` line below for why — so we
    // don't accumulate sums in this loop.
    for (let j = start; j < end; j++) {
      const r = rows[j];
      if (r.count === 0) continue;
      if (r.min != null) {
        sumMin += r.min;
        cMin++;
      }
      if (r.max != null) {
        sumMax += r.max;
        cMax++;
      }
      if (r.mean != null) {
        sumMean += r.mean;
        cMean++;
      }
    }
    return {
      ts: row.ts,
      min: cMin > 0 ? sumMin / cMin : null,
      max: cMax > 0 ? sumMax / cMax : null,
      mean: cMean > 0 ? sumMean / cMean : null,
      // For sum-style metrics (rain), keep the raw daily totals —
      // smoothing a sum produces a meaningless "average daily total"
      // and obscures the bursty signal that bars are meant to show.
      sum: row.sum,
      count: row.count,
    };
  });
}

