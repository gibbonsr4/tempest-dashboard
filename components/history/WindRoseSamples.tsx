"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import type { HistorySample } from "@/lib/hooks/useRecentHistory";
import { cardinal, mpsToMph } from "@/lib/tempest/conversions";
import { DIR_BINS } from "./WindRose";

/**
 * Short-range wind rose: 16-direction × 5-band Beaufort histogram of
 * sub-daily `HistorySample`s. Each sample contributes one vote to its
 * (direction, speed) bin. The headline answers both "where does wind
 * come from?" and "how strong is it from each direction?".
 *
 * Long-range (daily-aggregate) rendering lives in `WindRoseMonthly.tsx`;
 * the parent `WindRose` dispatches between the two based on the input
 * shape.
 */

interface SpeedBand {
  /** lower bound, mph (inclusive) */
  min: number;
  /** upper bound, mph (exclusive); Infinity for the last band */
  max: number;
  label: string;
  color: string;
}

// Speed bands roughly tied to Beaufort thresholds, with colors
// progressing cool→warm so heavier wind reads as more urgent.
const BANDS: SpeedBand[] = [
  { min: 0, max: 3, label: "<3", color: "var(--wind-calm)" },
  { min: 3, max: 8, label: "3–8", color: "var(--wind-light)" },
  { min: 8, max: 13, label: "8–13", color: "var(--wind-moderate)" },
  { min: 13, max: 19, label: "13–19", color: "var(--wind-fresh)" },
  { min: 19, max: Infinity, label: "19+", color: "var(--wind-strong)" },
];

// Full-size rose constants.
const VIEW = 320;
const CX = VIEW / 2;
const CY = VIEW / 2;
const OUTER_R = VIEW / 2 - 30;
const INNER_R = 14;

function binSamples(samples: HistorySample[]): {
  bins: number[][];
  total: number;
} {
  const grid = Array.from({ length: DIR_BINS }, () =>
    new Array<number>(BANDS.length).fill(0),
  );
  let total = 0;
  for (const s of samples) {
    if (s.windAvgMps == null || s.windDirDeg == null) continue;
    const mph = mpsToMph(s.windAvgMps);
    const deg = ((s.windDirDeg % 360) + 360) % 360;
    const dirIdx = Math.floor(((deg + 11.25) % 360) / 22.5) % DIR_BINS;
    const bandIdx = BANDS.findIndex((b) => mph >= b.min && mph < b.max);
    if (bandIdx === -1) continue;
    grid[dirIdx][bandIdx] += 1;
    total += 1;
  }
  return { bins: grid, total };
}

export function SamplesWindRose({ samples }: { samples: HistorySample[] }) {
  const { bins, total } = React.useMemo(() => binSamples(samples), [samples]);

  const maxBinTotal = React.useMemo(() => {
    let m = 0;
    for (const row of bins) {
      const t = row.reduce((a, b) => a + b, 0);
      if (t > m) m = t;
    }
    return m;
  }, [bins]);

  // Prevailing direction = the bin with the highest total count.
  // We surface its cardinal label in the aria-label so a screen-reader
  // user gets the headline takeaway without having to navigate the
  // SVG element-by-element.
  const prevailing = React.useMemo(() => {
    if (total === 0) return null;
    let bestIdx = 0;
    let bestCount = -1;
    bins.forEach((row, i) => {
      const t = row.reduce((a, b) => a + b, 0);
      if (t > bestCount) {
        bestCount = t;
        bestIdx = i;
      }
    });
    const centerDeg = (bestIdx * 360) / DIR_BINS;
    const fraction = bestCount / total;
    return { cardinal: cardinal(centerDeg), pctOfTotal: fraction };
  }, [bins, total]);

  const ariaLabel = prevailing
    ? `Wind rose: ${total.toLocaleString()} samples; prevailing wind from the ${prevailing.cardinal} (${Math.round(
        prevailing.pctOfTotal * 100,
      )}% of samples)`
    : `Wind rose: no samples`;

  const cardinalLabels = ["N", "E", "S", "W"];

  if (total === 0) {
    return (
      <Card className="p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          Wind rose
        </div>
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          Not enough wind data
        </div>
      </Card>
    );
  }

  const halfBin = (Math.PI * 2) / DIR_BINS / 2;

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Wind rose
        </div>
        <div className="tabular text-[11px] text-muted-foreground">
          {total.toLocaleString()} samples
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <svg
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          width="100%"
          className="block aspect-square h-auto max-w-[320px]"
          role="img"
          aria-label={ariaLabel}
        >
          {/* concentric reference rings */}
          {[0.25, 0.5, 0.75, 1].map((frac, i) => (
            <circle
              key={i}
              cx={CX}
              cy={CY}
              r={INNER_R + (OUTER_R - INNER_R) * frac}
              fill="none"
              stroke="var(--color-border)"
              strokeOpacity={0.3}
              strokeDasharray="3 3"
            />
          ))}

          {/* compass spokes */}
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i * Math.PI) / 4 - Math.PI / 2;
            return (
              <line
                key={i}
                x1={CX + INNER_R * Math.cos(angle)}
                y1={CY + INNER_R * Math.sin(angle)}
                x2={CX + OUTER_R * Math.cos(angle)}
                y2={CY + OUTER_R * Math.sin(angle)}
                stroke="var(--color-border)"
                strokeOpacity={0.25}
              />
            );
          })}

          {/* wedges */}
          {bins.map((row, dirIdx) => {
            const totalThisDir = row.reduce((a, b) => a + b, 0);
            if (totalThisDir === 0) return null;
            const centerAngle = (dirIdx / DIR_BINS) * Math.PI * 2 - Math.PI / 2;
            const startAngle = centerAngle - halfBin + 0.02;
            const endAngle = centerAngle + halfBin - 0.02;

            let cumulative = 0;
            return row.map((count, bandIdx) => {
              if (count === 0) return null;
              const innerFrac = cumulative / maxBinTotal;
              cumulative += count;
              const outerFrac = cumulative / maxBinTotal;
              const innerR = INNER_R + (OUTER_R - INNER_R) * innerFrac;
              const outerR = INNER_R + (OUTER_R - INNER_R) * outerFrac;
              return (
                <path
                  key={`${dirIdx}-${bandIdx}`}
                  d={annularSectorPath(
                    CX,
                    CY,
                    innerR,
                    outerR,
                    startAngle,
                    endAngle,
                  )}
                  fill={BANDS[bandIdx].color}
                  stroke="var(--color-card)"
                  strokeWidth={0.5}
                />
              );
            });
          })}

          {/* cardinal labels */}
          {cardinalLabels.map((label, i) => {
            const angle = (i * Math.PI) / 2 - Math.PI / 2;
            const r = OUTER_R + 14;
            return (
              <text
                key={label}
                x={CX + r * Math.cos(angle)}
                y={CY + r * Math.sin(angle) + 4}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] tracking-wide"
              >
                {label}
              </text>
            );
          })}
        </svg>

        {/* legend */}
        <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-muted-foreground">
          {BANDS.map((band) => (
            <span key={band.label} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: band.color }}
              />
              {band.label} mph
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

/**
 * SVG path command string for an annular sector (a ring slice). Args
 * specify the inner and outer radii and the start / end angles in
 * radians. Angles are measured in screen-space (0 = +X axis), which
 * is what the SVG arc command expects.
 */
function annularSectorPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  start: number,
  end: number,
): string {
  const x1Outer = cx + rOuter * Math.cos(start);
  const y1Outer = cy + rOuter * Math.sin(start);
  const x2Outer = cx + rOuter * Math.cos(end);
  const y2Outer = cy + rOuter * Math.sin(end);
  const x1Inner = cx + rInner * Math.cos(end);
  const y1Inner = cy + rInner * Math.sin(end);
  const x2Inner = cx + rInner * Math.cos(start);
  const y2Inner = cy + rInner * Math.sin(start);
  const largeArc = end - start > Math.PI ? 1 : 0;
  return [
    `M ${x1Outer} ${y1Outer}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}`,
    `L ${x1Inner} ${y1Inner}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x2Inner} ${y2Inner}`,
    "Z",
  ].join(" ");
}
