/**
 * Shared helpers for value-conditional chart gradients. The History
 * tab uses the same temperature palette as the Now tab's hourly
 * strip (`components/now/ForecastHourly.tsx`), mapped to the chart's
 * visible y-domain so the SAME absolute °F value always renders as
 * the SAME color across the two tabs.
 *
 * The math: each absolute threshold maps to a position in [0, 1] via
 *   ratio = 1 - (threshold - min) / (max - min)
 * (Recharts paints SVG gradients top-down, so we invert.) Stops
 * outside the visible domain clip to the nearest edge — at year
 * scale where the visible range might span 30–115°F, you get all 6
 * stops; in a narrower window only the relevant subset shows up.
 */

export interface GradientStop {
  /** Position in the gradient, 0..1. */
  offset: number;
  /** CSS color or var() expression. */
  color: string;
}

/**
 * Temperature palette — keyed to absolute °F so the same value always
 * reads the same color regardless of which chart it's on. Stops are
 * declared HIGH → LOW so the gradient paints hot-on-top, cold-on-
 * bottom after the position-inversion in `tempGradientStops`. Matches
 * `--temp-cold` → `--temp-extreme` tokens in `app/globals.css`.
 */
const TEMP_THRESHOLDS: ReadonlyArray<{ tempF: number; color: string }> = [
  { tempF: 110, color: "var(--temp-extreme)" },
  { tempF: 95, color: "var(--temp-hot)" },
  { tempF: 80, color: "var(--temp-warm)" },
  { tempF: 65, color: "var(--temp-mild)" },
  { tempF: 50, color: "var(--temp-cool)" },
  { tempF: 38, color: "var(--temp-cold)" },
];

/**
 * Map the absolute-temperature palette onto a chart's visible y-domain.
 * Pass the data's min/max °F (raw, before any Recharts auto-padding);
 * the returned stops are sorted by offset for a stable
 * `<linearGradient>` render. Degenerate domains (NaN, min ≥ max)
 * return a single muted stop so the SVG is still valid.
 */
export function tempGradientStops(
  minF: number,
  maxF: number,
): GradientStop[] {
  if (
    !Number.isFinite(minF) ||
    !Number.isFinite(maxF) ||
    maxF <= minF
  ) {
    return [
      { offset: 0, color: "var(--temp-mild)" },
      { offset: 1, color: "var(--temp-mild)" },
    ];
  }
  return TEMP_THRESHOLDS.map(({ tempF, color }) => {
    const ratio = 1 - (tempF - minF) / (maxF - minF);
    return {
      offset: Math.max(0, Math.min(1, ratio)),
      color,
    };
  }).sort((a, b) => a.offset - b.offset);
}
