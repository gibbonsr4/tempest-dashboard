/**
 * Field-extraction adapters for the History tab. The chart components
 * (`MetricChart` for short-range, `DailyAggregateChart` for long-range)
 * each take a `pick` function that maps a row to the value they
 * render. Centralizing these here keeps `HistoryClient.tsx` focused
 * on layout + range orchestration.
 *
 * Two families:
 *   - **Sample pickers** — single value per `HistorySample` (used at
 *     24h / 7d / 30d, where each chart point is an aggregated bucket).
 *   - **Daily-aggregate pickers** — `{min, max, mean, sum}` per
 *     `DeviceDailyAggregate` row (90d / YTD / 1y, where each point
 *     IS the day's pre-rolled stats from `obs_st_ext`).
 *
 * Both families do unit conversion (metric → imperial) at this
 * boundary so the chart components stay metric-agnostic.
 */

import type { HistorySample } from "@/lib/hooks/useRecentHistory";
import type { DeviceDailyAggregate } from "@/lib/tempest/server-client";
import { cToF, mbToInHg, mmToIn, mpsToMph } from "@/lib/tempest/conversions";

// ─── Sample pickers (short-range path) ──────────────────────────────

export const pickTempF = (s: HistorySample) =>
  s.tempC != null ? cToF(s.tempC) : null;
export const pickWindMph = (s: HistorySample) =>
  s.windAvgMps != null ? mpsToMph(s.windAvgMps) : null;
export const pickGustMph = (s: HistorySample) =>
  s.windGustMps != null ? mpsToMph(s.windGustMps) : null;
export const pickHumidity = (s: HistorySample) => s.humidityPct;
export const pickPressureInHg = (s: HistorySample) =>
  s.pressureMb != null ? mbToInHg(s.pressureMb) : null;
export const pickRainIn = (s: HistorySample) =>
  s.rainMm != null ? mmToIn(s.rainMm) : null;

// ─── Daily-aggregate pickers (long-range path) ──────────────────────
//
// Each returns the {min, max, mean, sum} shape that DailyAggregateChart
// consumes, derived from the corresponding obs_st_ext fields.
// Temperature and humidity have meaningful min/max/mean; rain has only
// a daily total (sum); wind avg has mean; wind gust uses max; pressure
// has min/max/mean.

export const dayPickTemp = (r: DeviceDailyAggregate) => ({
  min: r.tempMinC != null ? cToF(r.tempMinC) : null,
  max: r.tempMaxC != null ? cToF(r.tempMaxC) : null,
  mean: r.tempAvgC != null ? cToF(r.tempAvgC) : null,
  sum: null,
});
export const dayPickHumidity = (r: DeviceDailyAggregate) => ({
  min: r.humidityMinPct,
  max: r.humidityMaxPct,
  mean: r.humidityAvgPct,
  sum: null,
});
export const dayPickWindAvg = (r: DeviceDailyAggregate) => ({
  min: null,
  max: null,
  mean: r.windAvgMps != null ? mpsToMph(r.windAvgMps) : null,
  sum: null,
});
export const dayPickWindGust = (r: DeviceDailyAggregate) => ({
  min: null,
  max: r.windGustMaxMps != null ? mpsToMph(r.windGustMaxMps) : null,
  mean: null,
  sum: null,
});
export const dayPickPressure = (r: DeviceDailyAggregate) => ({
  min: r.pressureMinMb != null ? mbToInHg(r.pressureMinMb) : null,
  max: r.pressureMaxMb != null ? mbToInHg(r.pressureMaxMb) : null,
  mean: r.pressureAvgMb != null ? mbToInHg(r.pressureAvgMb) : null,
  sum: null,
});
export const dayPickRain = (r: DeviceDailyAggregate) => ({
  min: null,
  max: null,
  mean: null,
  // rainAccumFinalMm is the rain-check verified daily total — same
  // value used by the YTD tile in the rain card. Convert mm → in.
  sum: r.rainAccumFinalMm != null ? mmToIn(r.rainAccumFinalMm) : null,
});
