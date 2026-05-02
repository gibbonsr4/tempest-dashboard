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

export interface StormWindow {
  /** All samples (zero or non-zero) since station-local midnight that
   *  carry a finite value for the chosen field. The histogram bins
   *  these into per-bucket counts/totals. */
  samples: { ts: number; value: number }[];
  /** Epoch ms — chart's left edge. `max(todayStart, min(firstNonZero,
   *  now - 3h))`: pinned to today's start so a strike at 1 AM doesn't
   *  drag the axis into yesterday. */
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
    Math.min(firstNonZeroTs, now - MIN_WINDOW_MS),
  );
  return { samples: stormSamples, startMs, endMs: now };
}
