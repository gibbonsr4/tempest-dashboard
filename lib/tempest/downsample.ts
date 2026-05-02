/**
 * Pure bucket-mean downsample for the History route. Extracted from
 * the route handler so it can be unit-tested without a live HTTP
 * surface, and so the few quantities that don't take a plain
 * arithmetic mean (wind direction, rain accumulation) live in one
 * file with explanatory comments.
 *
 * Two special cases vs. naive averaging:
 *
 *   - Wind direction is a circular quantity. Averaging 350° and 10°
 *     arithmetically gives 180° (south); the correct mean is 0°
 *     (north). We compute it as the angle of the mean unit vector:
 *     each sample contributes (sin θ, cos θ); average those, then
 *     atan2 back to degrees.
 *
 *   - Rain is per-minute accumulation. The headline daily total is
 *     additive across the day, not a "typical" value, so we sum it
 *     per bucket rather than averaging. (Tempest's `rainMm` field is
 *     accumulation since the last observation; in a 1-min cadence
 *     each value already represents that minute's catch.)
 */

import type { DeviceObsSample } from "./server-client";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

interface BucketAccumulator {
  // Generic running sums for arithmetic-mean fields.
  sums: Partial<Record<keyof DeviceObsSample, number>>;
  counts: Partial<Record<keyof DeviceObsSample, number>>;
  // Timestamp tracking (we emit the bucket's mean ts).
  tsSum: number;
  tsCount: number;
  // Direction-vector tracking (separate from `sums` because direction
  // is averaged in vector space, not scalar).
  dirSinSum: number;
  dirCosSum: number;
  dirCount: number;
  // Rain-sum tracking (separate from `sums` because rain is summed,
  // not averaged).
  rainSum: number;
  rainCount: number;
  // Lightning strike count is also additive — strikes within a
  // bucket should accumulate, not average.
  strikeSum: number;
  strikeCount: number;
}

/** Fields that get arithmetic-mean treatment. */
const MEAN_FIELDS = [
  "windAvgMps",
  "windGustMps",
  "pressureMb",
  "tempC",
  "humidityPct",
  "uv",
  "solarWm2",
  "batteryV",
] as const satisfies readonly (keyof DeviceObsSample)[];

/**
 * Split `samples` into N equal-width time buckets and emit one
 * `DeviceObsSample` per non-empty bucket. Empty buckets are dropped.
 */
export function downsample(
  samples: DeviceObsSample[],
  buckets: number,
): DeviceObsSample[] {
  if (samples.length === 0) return [];
  const startTs = samples[0].ts;
  const endTs = samples[samples.length - 1].ts;
  if (endTs <= startTs) return samples;
  const step = (endTs - startTs) / buckets;

  const grid: BucketAccumulator[] = Array.from({ length: buckets }, () => ({
    sums: {},
    counts: {},
    tsSum: 0,
    tsCount: 0,
    dirSinSum: 0,
    dirCosSum: 0,
    dirCount: 0,
    rainSum: 0,
    rainCount: 0,
    strikeSum: 0,
    strikeCount: 0,
  }));

  for (const s of samples) {
    const idx = Math.min(buckets - 1, Math.floor((s.ts - startTs) / step));
    const cell = grid[idx];
    cell.tsSum += s.ts;
    cell.tsCount += 1;

    for (const key of MEAN_FIELDS) {
      const v = s[key];
      if (typeof v === "number" && Number.isFinite(v)) {
        cell.sums[key] = (cell.sums[key] ?? 0) + v;
        cell.counts[key] = (cell.counts[key] ?? 0) + 1;
      }
    }

    if (typeof s.windDirDeg === "number" && Number.isFinite(s.windDirDeg)) {
      const rad = s.windDirDeg * DEG_TO_RAD;
      cell.dirSinSum += Math.sin(rad);
      cell.dirCosSum += Math.cos(rad);
      cell.dirCount += 1;
    }

    if (typeof s.rainMm === "number" && Number.isFinite(s.rainMm)) {
      cell.rainSum += s.rainMm;
      cell.rainCount += 1;
    }

    if (
      typeof s.lightningStrikeCount === "number" &&
      Number.isFinite(s.lightningStrikeCount)
    ) {
      cell.strikeSum += s.lightningStrikeCount;
      cell.strikeCount += 1;
    }
  }

  const out: DeviceObsSample[] = [];
  for (const cell of grid) {
    if (cell.tsCount === 0) continue;
    out.push({
      ts: cell.tsSum / cell.tsCount,
      windAvgMps: avg(cell.sums.windAvgMps, cell.counts.windAvgMps),
      windGustMps: avg(cell.sums.windGustMps, cell.counts.windGustMps),
      windDirDeg: vectorMeanDeg(cell.dirSinSum, cell.dirCosSum, cell.dirCount),
      pressureMb: avg(cell.sums.pressureMb, cell.counts.pressureMb),
      tempC: avg(cell.sums.tempC, cell.counts.tempC),
      humidityPct: avg(cell.sums.humidityPct, cell.counts.humidityPct),
      uv: avg(cell.sums.uv, cell.counts.uv),
      solarWm2: avg(cell.sums.solarWm2, cell.counts.solarWm2),
      rainMm: cell.rainCount === 0 ? null : cell.rainSum,
      batteryV: avg(cell.sums.batteryV, cell.counts.batteryV),
      lightningStrikeCount:
        cell.strikeCount === 0 ? null : cell.strikeSum,
    });
  }
  return out;
}

function avg(sum: number | undefined, count: number | undefined): number | null {
  if (!count || sum == null) return null;
  return sum / count;
}

/**
 * Mean of `count` direction samples whose unit-vector components are
 * accumulated in `sinSum` / `cosSum`. Returns degrees in [0, 360).
 * Returns null when no samples were collected, or when the resultant
 * vector is so close to the origin that direction is undefined
 * (perfectly opposing winds — the meteorological "no prevailing
 * direction" case).
 */
export function vectorMeanDeg(
  sinSum: number,
  cosSum: number,
  count: number,
): number | null {
  if (count === 0) return null;
  const sinMean = sinSum / count;
  const cosMean = cosSum / count;
  // Resultant magnitude under ~1e-9 means samples cancelled to noise.
  if (Math.hypot(sinMean, cosMean) < 1e-9) return null;
  const deg = Math.atan2(sinMean, cosMean) * RAD_TO_DEG;
  // Normalize to [0, 360).
  return ((deg % 360) + 360) % 360;
}
