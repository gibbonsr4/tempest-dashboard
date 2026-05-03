"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { cardinal, mpsToMph } from "@/lib/tempest/conversions";
import type { DeviceDailyAggregate } from "@/lib/tempest/server-client";
import { DIR_BINS } from "./WindRose";

/**
 * Long-range wind layout: compact monthly stats grid. One cell per
 * station-local month, each showing a compass arrow rotated to the
 * month's prevailing direction (mode bin of vector-averaged daily
 * `windDirDeg`), a cardinal label, and "avg / peak-gust" mph
 * (avg = mean of daily `windAvgMps`; peak-gust = max of daily
 * `windGustMaxMps`).
 *
 * Why monthly instead of a Beaufort-banded annual rose? At year
 * scale the daily-mean speed collapses most days into the "calm"
 * band, which conveys nothing. The seasonal shift in prevailing
 * direction (whatever's locally meaningful — monsoon onset, frontal
 * tracks, sea-breeze regimes, etc.) is the more useful signal at
 * this range.
 *
 * The 3 × 4 grid (or 6 × 2 at lg+ via dynamic `--lg-cols`) keeps the
 * card's height matched to the adjacent Personal Records card on
 * desktop.
 */

export interface MonthStats {
  /** YYYY-MM key (station-local). */
  key: string;
  /** Center degree of the prevailing (mode) direction bin. */
  prevailingDeg: number;
  /** Cardinal label for the prevailing direction, or null when no data. */
  prevailingDir: string | null;
  /** Mean of daily `windAvgMps` across the month, expressed in mph. */
  avgMph: number | null;
  /** Max of daily `windGustMaxMps` across the month, in mph. */
  gustMph: number | null;
  /** Number of days with any data this month — context for confidence. */
  days: number;
}

/**
 * Walk daily aggregates once and bucket them by station-local month,
 * computing for each month: prevailing direction (mode of 16-bin
 * histogram), mean of daily windAvgMps, and max daily peak gust.
 *
 * Rows missing windDirDeg / windAvgMps / windGustMaxMps are treated
 * per-field — a row with valid speed but missing direction still
 * contributes to avg / gust, just not to direction bins.
 */
export function computeMonthlyStats(
  rows: DeviceDailyAggregate[],
): MonthStats[] {
  interface Acc {
    dirCounts: number[];
    avgSum: number;
    avgN: number;
    /** Highest daily peak gust seen this month, or null when no day
     *  contributed a numeric value. Tracked as `null`-vs-number rather
     *  than initialized to 0, so a (rare but legitimate) all-calm
     *  month with literal 0-mps gusts emits "0" instead of "—". */
    gustMax: number | null;
    total: number;
  }
  const groups = new Map<string, Acc>();

  for (const r of rows) {
    const key = r.date.slice(0, 7);
    let g = groups.get(key);
    if (!g) {
      g = {
        dirCounts: new Array<number>(DIR_BINS).fill(0),
        avgSum: 0,
        avgN: 0,
        gustMax: null,
        total: 0,
      };
      groups.set(key, g);
    }
    g.total += 1;
    if (r.windDirDeg != null) {
      const deg = ((r.windDirDeg % 360) + 360) % 360;
      const idx = Math.floor(((deg + 11.25) % 360) / 22.5) % DIR_BINS;
      g.dirCounts[idx] += 1;
    }
    if (r.windAvgMps != null) {
      g.avgSum += r.windAvgMps;
      g.avgN += 1;
    }
    if (r.windGustMaxMps != null) {
      if (g.gustMax == null || r.windGustMaxMps > g.gustMax) {
        g.gustMax = r.windGustMaxMps;
      }
    }
  }

  // Chronological order (YYYY-MM string sort matches calendar order),
  // so a 1y rolling window reads naturally — e.g. "May '25 → Apr '26".
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, g]) => {
      let bestIdx = 0;
      let bestCount = 0;
      g.dirCounts.forEach((c, i) => {
        if (c > bestCount) {
          bestCount = c;
          bestIdx = i;
        }
      });
      const prevailingDeg = (bestIdx * 360) / DIR_BINS;
      return {
        key,
        prevailingDeg,
        prevailingDir: bestCount > 0 ? cardinal(prevailingDeg) : null,
        avgMph: g.avgN > 0 ? mpsToMph(g.avgSum / g.avgN) : null,
        gustMph: g.gustMax != null ? mpsToMph(g.gustMax) : null,
        days: g.total,
      };
    });
}

export function MonthlyWindGrid({ rows }: { rows: DeviceDailyAggregate[] }) {
  const months = React.useMemo(() => computeMonthlyStats(rows), [rows]);

  const totalDays = React.useMemo(
    () => months.reduce((s, m) => s + m.days, 0),
    [months],
  );

  // True if the visible months span more than one calendar year. When
  // they do, cell labels include the year suffix at year boundaries so
  // "Jan '26" doesn't read as the same month as "Jan '25".
  const spansMultipleYears = React.useMemo(() => {
    if (months.length === 0) return false;
    const firstYear = months[0].key.slice(0, 4);
    return months.some((m) => m.key.slice(0, 4) !== firstYear);
  }, [months]);

  if (totalDays === 0) {
    return (
      <Card className="p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          Wind by month
        </div>
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          Not enough wind data
        </div>
      </Card>
    );
  }

  // At lg+, this card sits next to PersonalRecords (3 cols × 2 rows
  // of stat tiles) inside a 50/50 grid. Computing the column count
  // dynamically as `ceil(months / 2)` keeps the wind grid laid out
  // in exactly 2 rows — matching the peaks card's height and
  // preventing the empty-bottom space we'd otherwise see at YTD
  // spans (e.g. 181 days = 6 months → 6×2 grid would be 1 row at a
  // fixed 6-col layout). Cells then stretch via `auto-rows-fr` so
  // they actually fill that 2-row space.
  //
  // Below lg the cards stack vertically, so we don't need height
  // matching there — the simpler responsive 3/4-col layouts give
  // each cell a comfortable size.
  const lgCols = Math.max(1, Math.ceil(months.length / 2));

  return (
    <Card className="flex flex-col p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Wind by month
          </div>
          <div className="text-[10px] text-muted-foreground/70">
            Avg / peak gust (mph)
          </div>
        </div>
        <div className="tabular text-[11px] text-muted-foreground">
          {totalDays.toLocaleString()} days
        </div>
      </div>

      <div
        className="grid flex-1 auto-rows-fr grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-[repeat(var(--lg-cols),minmax(0,1fr))]"
        style={{ ["--lg-cols" as string]: lgCols } as React.CSSProperties}
      >
        {months.map((m, i) => {
          const prevKey = i > 0 ? months[i - 1].key : null;
          const showYear =
            spansMultipleYears &&
            (prevKey === null || prevKey.slice(0, 4) !== m.key.slice(0, 4));
          return <MonthCell key={m.key} stats={m} showYear={showYear} />;
        })}
      </div>
    </Card>
  );
}

interface MonthCellProps {
  stats: MonthStats;
  showYear: boolean;
}

function MonthCell({ stats, showYear }: MonthCellProps) {
  // Stable mid-month UTC date for the month-name label. UTC is fine
  // here because we only need the month name, and "-15" is far enough
  // from month edges that no station tz could shift it.
  const date = new Date(`${stats.key}-15T12:00:00Z`);
  const monthName = date.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const yearSuffix = stats.key.slice(2, 4);
  const monthLabel = showYear ? `${monthName} '${yearSuffix}` : monthName;

  const avgText = stats.avgMph != null ? stats.avgMph.toFixed(1) : "—";
  const gustText = stats.gustMph != null ? stats.gustMph.toFixed(0) : "—";
  const ariaLabel = stats.prevailingDir
    ? `${monthLabel}: prevailing ${stats.prevailingDir}, avg ${avgText} mph, peak gust ${gustText} mph, ${stats.days} days`
    : `${monthLabel}: no wind data`;

  return (
    <div
      className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-border/50 bg-card/40 p-2"
      role="img"
      aria-label={ariaLabel}
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {monthLabel}
      </div>
      <CompassArrow
        deg={stats.prevailingDeg}
        muted={stats.prevailingDir == null}
      />
      <div className="text-[11px] font-medium leading-tight">
        {stats.prevailingDir ?? "—"}
      </div>
      <div className="text-[10px] tabular leading-tight">
        <span className="text-foreground/85">{avgText}</span>
        <span className="mx-0.5 text-muted-foreground/60">/</span>
        <span className="text-foreground/85">{gustText}</span>
      </div>
    </div>
  );
}

/**
 * Compass arrow icon. Rendered in a 100×100 viewBox so the path
 * coordinates are stable, then scaled with `width/height={28}`.
 * Rotation uses CSS `transform: rotate(${deg}deg)` — meteorological
 * convention (0° = N = up, 90° = E = right) matches CSS rotate
 * directly, and the arrow points AT the source the wind is coming
 * from (matching a wind vane / weathercock).
 *
 * `muted` paints the arrow in a muted tone for cells with no
 * direction data (still rendered so the cell shape stays consistent
 * across the grid).
 */
function CompassArrow({
  deg,
  muted = false,
}: {
  deg: number;
  muted?: boolean;
}) {
  return (
    <svg
      width={28}
      height={28}
      viewBox="-50 -50 100 100"
      style={{ transform: `rotate(${deg}deg)` }}
      className={muted ? "text-muted-foreground/40" : "text-foreground/85"}
      aria-hidden
    >
      <circle
        cx={0}
        cy={0}
        r={42}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeWidth={1}
      />
      <path d="M 0 -38 L 14 14 L 0 6 L -14 14 Z" fill="currentColor" />
    </svg>
  );
}
