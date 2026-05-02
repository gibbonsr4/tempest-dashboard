/**
 * Pure interpretation helpers — turn raw observations into the
 * human-readable phrases and chips the dashboard surfaces. Everything
 * here is deterministic and pure: same input → same output, no fetches.
 */

import type { PressureTrend } from "./types";

/**
 * Pressure trend interpretation, driven by rate of change in mb/hr.
 * Thresholds are the meteorological convention used by NOAA/USAF: any
 * change ≥ ~1.5 mb/hr is "rapid"; ≥ ~0.3 mb/hr is "slow"; smaller is
 * "steady".
 *
 * Returns three fields:
 * - `arrow`: a glyph for the inline trend indicator
 * - `phrase`: the full directional phrase, used by tests and aria labels
 * - `hint`: the *meteorological* interpretation only (no directional
 *   word) — used by the detail line so it doesn't duplicate the
 *   "Rising / Steady / Falling" label that already lives on the
 *   status chip.
 */
export function interpretPressure(
  deltaPerHrMb: number,
): PressureTrend & { hint: string } {
  const r = deltaPerHrMb;
  if (r > 1.5)
    return { arrow: "▲", phrase: "rising rapidly — clearing fast", hint: "clearing fast" };
  if (r > 0.3)
    return {
      arrow: "▴",
      phrase: "rising slowly — fair weather continuing",
      hint: "fair weather continuing",
    };
  // Steady: no inline glyph. The status chip ("Steady") + the detail
  // hint ("fair conditions") already convey "nothing's changing"; an
  // inline minus next to the value reads as visual noise rather than
  // information. The directional ▲/▴/▾/▼ glyphs stay because they
  // reinforce direction at a glance when something IS happening.
  if (r > -0.3) return { arrow: "", phrase: "steady", hint: "fair conditions" };
  if (r > -1.5)
    return { arrow: "▾", phrase: "falling slowly — unsettled", hint: "unsettled" };
  return {
    arrow: "▼",
    phrase: "falling rapidly — storm approaching",
    hint: "storm approaching",
  };
}

/**
 * Compute pressure change rate in mb/hr from a recent-history sample
 * buffer, using a 3-hour comparison anchor against the current value.
 *
 * Why this exists: Tempest's `pressure_trend` field is a coarse string
 * (rising / steady / falling) — fine for a chip label, useless as a
 * rate to feed into `interpretPressure`. The card previously synthesized
 * ±0.5 mb/hr from the trend string, which always landed in the
 * "fair weather continuing" / "unsettled" buckets and made the more
 * dramatic phrasings ("rising rapidly — clearing fast", "falling
 * rapidly — storm approaching") unreachable in practice.
 *
 * Strategy: pick the historical sample closest to `nowMs - 3h` that
 * has a finite pressure, and divide the delta by the elapsed hours.
 * Only emit a non-zero rate when that candidate sits within a trust
 * window of ±1.5 hours around the 3-hour anchor (i.e. its actual age
 * is between 1.5h and 4.5h). Outside that window — e.g. the buffer
 * only has very recent samples, or there's been an outage and the
 * "closest to 3h ago" candidate is actually 6h old — surface no
 * trend rather than the wrong one. The dramatic phrasings depend on
 * a real 3-hour delta; projecting an old delta onto "now" reads as
 * confidently wrong.
 */
const TRUST_WINDOW_MIN_H = 1.5;
const TRUST_WINDOW_MAX_H = 4.5;

export function pressureRateMbPerHr(
  samples: ReadonlyArray<{ ts: number; pressureMb: number | null }>,
  currentMb: number | null,
  nowMs: number = Date.now(),
): number {
  if (currentMb == null || samples.length === 0) return 0;
  const targetMs = nowMs - 3 * 3600_000;
  let candidate: { ts: number; pressureMb: number | null } | null = null;
  let bestDelta = Infinity;
  for (const s of samples) {
    if (s.pressureMb == null || !Number.isFinite(s.pressureMb)) continue;
    if (s.ts >= nowMs) continue;
    const delta = Math.abs(s.ts - targetMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      candidate = s;
    }
  }
  if (candidate == null || candidate.pressureMb == null) return 0;
  const elapsedHours = (nowMs - candidate.ts) / 3600_000;
  if (elapsedHours < TRUST_WINDOW_MIN_H || elapsedHours > TRUST_WINDOW_MAX_H) {
    return 0;
  }
  return (currentMb - candidate.pressureMb) / elapsedHours;
}

/**
 * Generic status descriptor used by the unified metric-tile pattern:
 * a short label + a band color so every tile's top-right chip reads
 * the same way regardless of metric.
 */
export interface MetricStatus {
  label: string;
  color: string;
}

/**
 * EPA UV index → band label. Bands are: 0–2 Low, 3–5 Moderate, 6–7 High,
 * 8–10 Very High, 11+ Extreme.
 */
export function uvBand(uv: number): MetricStatus {
  if (uv < 3) return { label: "Low", color: "var(--status-good)" };
  if (uv < 6) return { label: "Moderate", color: "var(--status-warn)" };
  if (uv < 8) return { label: "High", color: "var(--status-alert)" };
  if (uv < 11) return { label: "Very High", color: "var(--status-strong)" };
  return { label: "Extreme", color: "var(--status-extreme)" };
}

/** Relative humidity → comfort band. */
export function humidityBand(rh: number): MetricStatus {
  if (rh < 18) return { label: "Very dry", color: "var(--status-warn)" };
  if (rh < 30) return { label: "Dry", color: "var(--status-warn-soft)" };
  if (rh < 60) return { label: "Comfortable", color: "var(--status-good)" };
  if (rh < 75) return { label: "Humid", color: "var(--status-info)" };
  return { label: "Very humid", color: "var(--status-strong)" };
}

/** Solar radiation (W/m²) → light-level band. */
export function solarBand(wm2: number): MetricStatus {
  if (wm2 < 50) return { label: "Overcast", color: "var(--status-muted)" };
  if (wm2 < 200) return { label: "Low light", color: "var(--status-low-light)" };
  if (wm2 < 500) return { label: "Diffuse", color: "var(--status-diffuse)" };
  if (wm2 < 800) return { label: "Bright", color: "var(--status-warn)" };
  return { label: "Intense", color: "var(--status-alert)" };
}

/** Tempest's coarse pressure_trend string → status chip. */
export function pressureBand(trendStr: string | null | undefined): MetricStatus {
  switch (trendStr?.toLowerCase()) {
    case "rising":
      return { label: "Rising", color: "var(--status-rising)" };
    case "falling":
      return { label: "Falling", color: "var(--status-falling)" };
    default:
      return { label: "Steady", color: "var(--status-steady)" };
  }
}

/**
 * Compact descriptive phrase for the current conditions. Honest about
 * what the air is like, not opinionated about what activities suit it
 * — a weather dashboard shouldn't tell you that 5 am is a great time
 * for outdoor work.
 *
 * Inputs are imperial (the dashboard's default unit system). The
 * thresholds map to standard meteorological / public-health
 * conventions:
 *   - "Dangerous heat" at feels-like ≥ 105°F is the NWS Excessive
 *     Heat Warning threshold.
 *   - "Hard freeze" at feels-like ≤ 25°F is the standard agricultural
 *     definition.
 *   - The temp-band words ("Hot", "Warm", "Mild", etc.) and humidity
 *     bands are reasonable global defaults.
 * If you really want different vocabulary or banding, edit this file
 * — it's all pure functions.
 */
export function conditionsPhrase(input: {
  tempF: number;
  feelsLikeF?: number | null;
  humidity?: number | null;
  uv?: number | null;
  windMph?: number | null;
}): string {
  const { tempF, feelsLikeF, humidity, uv, windMph } = input;
  const feels = feelsLikeF ?? tempF;
  const rh = humidity ?? 0;
  const u = uv ?? 0;
  const w = windMph ?? 0;

  // Severity headlines first — overrule everything else.
  if (feels >= 105) return "Dangerous heat";
  if (feels <= 25) return "Hard freeze";

  // Compose temp + moisture + wind / UV qualifiers.
  const pieces: string[] = [];
  if (feels >= 100) pieces.push("Very hot");
  else if (feels >= 90) pieces.push("Hot");
  else if (feels >= 80) pieces.push("Warm");
  else if (feels >= 65) pieces.push("Mild");
  else if (feels >= 50) pieces.push("Cool");
  else if (feels >= 38) pieces.push("Chilly");
  else pieces.push("Cold");

  // The "very humid" threshold (75) matches `humidityBand` above so
  // the ComfortChip phrase and the humidity metric tile can't disagree.
  // Previously the threshold was 80, which created a 5-point window
  // (75-79% RH) where the tile said "Very humid" but the phrase said
  // just "humid". The "humid" entry threshold (65) deliberately stays
  // higher than the band's 60 — the phrase only adds a qualifier when
  // humidity is genuinely standout, while the band labels every cell.
  if (rh >= 75) pieces.push("very humid");
  else if (rh >= 65) pieces.push("humid");
  else if (rh < 18) pieces.push("very dry");
  else if (rh < 30) pieces.push("dry");

  if (w >= 25) pieces.push("windy");
  else if (w >= 15) pieces.push("breezy");

  if (u >= 8) pieces.push("intense UV");

  return pieces.join(", ");
}


/**
 * Whether the lightning module should promote itself above the hero —
 * a recent strike inside the configured radius means the user wants to
 * know *now*, regardless of what else is on screen.
 */
export function shouldPromoteLightning(input: {
  lastStrikeEpochMs: number | null;
  lastStrikeMi: number | null;
  now?: number;
}): boolean {
  if (input.lastStrikeEpochMs == null || input.lastStrikeMi == null) return false;
  const age = (input.now ?? Date.now()) - input.lastStrikeEpochMs;
  return age <= 30 * 60_000 && input.lastStrikeMi < 10;
}

/**
 * Whether the rain module should expand from one-line to detail mode —
 * either the station has reported rain in the last hour or any of the
 * day-totals are non-zero.
 */
export function shouldExpandRain(input: {
  lastHourPrecip: number | null;
  dayTotal: number | null;
  rateNow: number | null;
}): boolean {
  return Boolean(
    (input.lastHourPrecip ?? 0) > 0 ||
      (input.rateNow ?? 0) > 0 ||
      (input.dayTotal ?? 0) > 0,
  );
}

/**
 * AirNow AQI value → EPA band and accessible color. Bands match the
 * standard EPA color scale.
 */
export function aqiBand(aqi: number): MetricStatus {
  if (aqi <= 50) return { label: "Good", color: "var(--status-good)" };
  if (aqi <= 100) return { label: "Moderate", color: "var(--status-warn)" };
  if (aqi <= 150)
    return {
      label: "Unhealthy for Sensitive Groups",
      color: "var(--status-alert)",
    };
  if (aqi <= 200) return { label: "Unhealthy", color: "var(--status-strong)" };
  if (aqi <= 300)
    return { label: "Very Unhealthy", color: "var(--status-extreme)" };
  return { label: "Hazardous", color: "var(--status-extreme)" };
}
