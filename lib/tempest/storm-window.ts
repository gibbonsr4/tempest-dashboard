/**
 * Shared helper for the "storm window" computation used by the
 * lightning + rain expanded-card histograms. Both cards need the
 * same shape: filter samples to today (station-tz), find the first
 * non-zero value, and clamp the chart's left edge to a sensible
 * minimum so the time labels read "{first storm hour} · midpoint ·
 * now" instead of stretching back into yesterday.
 *
 * Returns `null` when there's no storm activity yet today — the
 * chart's job is to show storm shape, not absence.
 */

import type { HistorySample } from "@/lib/hooks/useRecentHistory";
import { startOfStationDay } from "@/lib/tempest/format";

/** Minimum visible window — the chart's left edge sits at least
 *  3 hours back from `now` so the storm reads as "ongoing" rather
 *  than collapsing to a single bar at the right edge. */
const MIN_WINDOW_MS = 3 * 3600_000;
/** Lead-in padding before the first storm sample. Without it the
 *  first bar sits flush against the chart's left edge with no
 *  breathing room — a small gap makes "the storm started here"
 *  read more naturally. */
const PRE_STORM_PAD_MS = 30 * 60_000;

export interface StormWindow {
  /** All samples (zero or non-zero) since station-local midnight that
   *  carry a finite value for the chosen field. The histogram bins
   *  these into per-bucket counts/totals. */
  samples: { ts: number; value: number }[];
  /** Epoch ms — chart's left edge.
   *  `max(todayStart, min(firstNonZero - PRE_STORM_PAD_MS, now - MIN_WINDOW_MS))`:
   *  pinned to today's start so a 1 AM strike doesn't drag the axis
   *  into yesterday, with a 30-min lead-in before the first sample so
   *  the first bar isn't flush against the chart's left edge. */
  startMs: number;
  /** Epoch ms — chart's right edge (`now`). */
  endMs: number;
}

/**
 * Build a storm window from a `HistorySample[]` and a value-picker.
 *
 * @param samples  Sub-daily history (from `useRecentHistory`).
 * @param now      Current epoch ms.
 * @param tz       Station-local IANA tz (from `useStationTz()`).
 * @param pickValue  Extracts the numeric metric from each sample;
 *                   return `null` (or non-finite) to skip a sample.
 * @returns The window, or `null` if no samples / no non-zero values
 *          since today's start.
 */
export function buildStormWindow(
  samples: HistorySample[] | undefined,
  now: number,
  tz: string,
  pickValue: (sample: HistorySample) => number | null | undefined,
): StormWindow | null {
  if (!samples || samples.length === 0) return null;
  const todayStart = startOfStationDay(now, tz);
  let firstNonZeroTs: number | null = null;
  const stormSamples: { ts: number; value: number }[] = [];
  for (const s of samples) {
    if (s.ts < todayStart) continue;
    const v = pickValue(s);
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (v > 0 && firstNonZeroTs == null) {
      firstNonZeroTs = s.ts;
    }
    stormSamples.push({ ts: s.ts, value: v });
  }
  if (firstNonZeroTs == null) return null;
  const startMs = Math.max(
    todayStart,
    Math.min(firstNonZeroTs - PRE_STORM_PAD_MS, now - MIN_WINDOW_MS),
  );
  return { samples: stormSamples, startMs, endMs: now };
}

/** Allowed bucket widths for the paired storm histograms, in
 *  minutes. Anything that falls between snaps to the closest entry. */
const BUCKET_SNAP_MIN = [5, 10, 15, 30, 60] as const;
const FALLBACK_BUCKET_MS = 30 * 60_000;

/**
 * Pick a single bucket width (ms) for the rain + lightning histograms
 * from the underlying history cadence. Both cards pull from the same
 * `useRecentHistory` query, so deriving one width here and passing it
 * to both gives them matching x-axes — paired bars at the same time
 * scale instead of one card at 32-min and the other at 29-min.
 *
 * Median (not mean) of consecutive sample intervals so a single dropped
 * sample doesn't drag the cadence estimate. Result is snapped to the
 * nearest entry in `BUCKET_SNAP_MIN` so tooltips and tick labels land
 * on whole-minute steps.
 */
export function computeStormBucketMs(
  samples: HistorySample[] | undefined,
): number {
  if (!samples || samples.length < 2) return FALLBACK_BUCKET_MS;
  const intervals: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].ts - samples[i - 1].ts;
    if (dt > 0) intervals.push(dt);
  }
  if (intervals.length === 0) return FALLBACK_BUCKET_MS;
  intervals.sort((a, b) => a - b);
  const mid = intervals.length / 2;
  const medianMs =
    intervals.length % 2 === 0
      ? (intervals[mid - 1] + intervals[mid]) / 2
      : intervals[Math.floor(mid)];
  const medianMin = medianMs / 60_000;
  let snapped: number = BUCKET_SNAP_MIN[0];
  let bestDelta = Math.abs(snapped - medianMin);
  for (const candidate of BUCKET_SNAP_MIN) {
    const delta = Math.abs(candidate - medianMin);
    if (delta < bestDelta) {
      bestDelta = delta;
      snapped = candidate;
    }
  }
  return snapped * 60_000;
}
