"use client";

import * as React from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMonthDay } from "@/lib/tempest/format";
import { useStationTz } from "@/lib/tempest/tz-context";
import { smoothDailyAggregates, type DailyAggregate } from "./aggregate";
import { TooltipRow } from "./DailyAggregateChartTooltip";

/**
 * Daily-aggregate chart for ranges longer than ~24h. Plots one entry
 * per day so trend reads cleanly across the week / month without the
 * diurnal cycle drowning out signal.
 *
 * Variants:
 *   - "range":  high/low band + mean line (temp, humidity)
 *   - "max":    line of daily maximum (gusts)
 *   - "mean":   line of daily mean (pressure, wind avg)
 *   - "sum":    bar of daily total (rain accumulation)
 */
type Variant = "range" | "max" | "mean" | "sum";

export function DailyAggregateChart({
  data,
  compare,
  smooth = 0,
  label,
  unit,
  color = "var(--chart-1)",
  variant,
  formatValue = (v) => v.toFixed(1),
  yDomain,
  className,
  chartHeight = "h-40",
  hideLabel = false,
}: {
  /**
   * Raw daily aggregates. Smoothing (if any) is applied internally
   * via the `smooth` prop — callers always pass the un-smoothed
   * source. Header summary stats are computed from this raw data
   * regardless of smoothing, so the displayed extremes always
   * reflect actual annual highs/lows.
   */
  data: DailyAggregate[];
  /**
   * Optional previous-period aggregates with timestamps already shifted
   * forward to align with `data`'s x-axis. Rendered as a dim companion
   * line (mean for range/mean variants, max for max, none for sum).
   * Smoothed using the same window as `data` when `smooth > 0`.
   */
  compare?: DailyAggregate[];
  /**
   * When > 0, applies a centered N-day moving average to the line
   * series for visual readability. Standard meteorological practice
   * at year scale (NOAA / NWS publish 7d / 14d / 30d rolling means).
   * Default 0 = no smoothing. Header summary stats (min / avg / max
   * / total) are ALWAYS computed from the raw data, so they reflect
   * actual extremes regardless of smoothing — chart shows the trend,
   * header shows the truth. The "smoothed ({N}-day)" badge stacked
   * under the metric label makes this distinction explicit to the
   * user.
   *
   * Sum-style metrics (rain) ignore the smooth prop because
   * averaging a sum-style metric across a week destroys the bursty
   * signal the bar chart is meant to show.
   */
  smooth?: number;
  label: string;
  unit: string;
  color?: string;
  variant: Variant;
  formatValue?: (v: number) => string;
  yDomain?: [number | "auto", number | "auto"];
  className?: string;
  /**
   * Tailwind class controlling the height of the chart's plot area
   * (and the matching "no data" placeholder). Defaults to `"h-40"`,
   * which is the inline-grid size. The `ExpandableChart` wrapper
   * passes a larger value (e.g. `"h-[60vh]"`) when the chart is
   * rendered inside its dialog so the user can read tooltips at
   * day-by-day precision.
   */
  chartHeight?: string;
  /**
   * When `true`, the small uppercase `label` element is omitted
   * from the card header — the smoothing badge and summary stats
   * are still rendered. Used by `ExpandableChart`, which already
   * shows the metric name in its own `DialogTitle` and would
   * otherwise duplicate the label inside the dialog.
   */
  hideLabel?: boolean;
}) {
  const tz = useStationTz();

  // Smoothing applied internally so the chart's API is just "raw
  // data in, optionally tell me how much to smooth." Sum-style
  // metrics (rain bars) ignore the smooth value because averaging
  // a daily-total destroys the bursty signal.
  const smoothedData = React.useMemo(() => {
    if (smooth <= 0 || variant === "sum") return data;
    return smoothDailyAggregates(data, smooth);
  }, [data, smooth, variant]);
  const smoothedCompare = React.useMemo(() => {
    if (!compare) return undefined;
    if (smooth <= 0 || variant === "sum") return compare;
    return smoothDailyAggregates(compare, smooth);
  }, [compare, smooth, variant]);

  // Recharts works most cleanly with object-shaped data + named keys,
  // so we pre-compute the keys we'll reference. When a compare period
  // is passed in, we merge its values onto each point under
  // `compareMean` / `compareMax` so a single ComposedChart handles
  // both lines on one shared x axis.
  const points = React.useMemo(() => {
    const compareByTs = new Map<number, DailyAggregate>();
    if (smoothedCompare) {
      for (const d of smoothedCompare) compareByTs.set(d.ts, d);
    }
    return smoothedData.map((d) => {
      const c = compareByTs.get(d.ts);
      return {
        ts: d.ts,
        min: d.min,
        max: d.max,
        mean: d.mean,
        sum: d.sum,
        range: [d.min, d.max] as [number | null, number | null],
        compareMean: c?.mean ?? null,
        compareMax: c?.max ?? null,
        compareSum: c?.sum ?? null,
      };
    });
  }, [smoothedData, smoothedCompare]);

  const summary = React.useMemo(() => {
    // Always compute the header summary from RAW data, never from
    // smoothed. Smoothing compresses peaks slightly, so a 1y temp
    // chart's smoothed line might bottom at ~42°F when the actual
    // annual minimum was 36°F. The header should reflect reality.
    if (data.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;
    for (const p of data) {
      const v =
        variant === "sum"
          ? p.sum
          : variant === "max"
            ? p.max
            : p.mean;
      if (v == null || !Number.isFinite(v)) continue;
      if (variant === "range") {
        if (p.min != null && p.min < min) min = p.min;
        if (p.max != null && p.max > max) max = p.max;
      } else {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      sum += v;
      count += 1;
    }
    if (count === 0) return null;
    // `total` is the raw sum of contributing values — meaningful for
    // accumulations (rain) under variant="sum". Crucially we do NOT
    // reconstruct it as `avg * points.length`; that compounded the
    // count×days mismatch when the input had outage days, inflating
    // displayed totals (B2-client).
    return { min, max, avg: sum / count, total: sum };
  }, [data, variant]);

  const config = {
    range: { label: `${label} range`, color },
    max: { label: `${label} max`, color },
    mean: { label, color },
    sum: { label, color },
    compareMean: { label: `${label} (previous)`, color: "var(--muted-foreground)" },
    compareMax: { label: `${label} max (previous)`, color: "var(--muted-foreground)" },
    compareSum: { label: `${label} (previous total)`, color },
  } satisfies ChartConfig;

  return (
    <Card className={className ?? "p-4"}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          {!hideLabel && (
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
          )}
          {/* When smoothing is on, surface it explicitly so the user
              understands why the line looks calmer than the raw header
              numbers — the line shows the trend (smoothed), the
              numbers show actual extremes (raw). The smoothing badge
              stacks UNDER the metric label rather than inline-after,
              which keeps "TEMPERATURE / smoothed (7-day)" reading as
              a title + sub-modifier instead of "TEMPERATURE 7-DAY"
              parsing as a single phrase about the chart's temporal
              resolution. */}
          {smooth > 0 && variant !== "sum" && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
              smoothed ({smooth}-day)
            </span>
          )}
        </div>
        {summary && (
          <div className="flex gap-3 text-[11px] text-muted-foreground tabular">
            <span>
              min{" "}
              <span className="text-foreground">
                {formatValue(summary.min)}
              </span>
            </span>
            <span>
              {variant === "sum" ? "total" : "avg"}{" "}
              <span className="text-foreground">
                {formatValue(
                  variant === "sum" ? summary.total : summary.avg,
                )}
              </span>
            </span>
            <span>
              max{" "}
              <span className="text-foreground">
                {formatValue(summary.max)}
              </span>
            </span>
            <span className="text-[10px] normal-case tracking-normal">
              {unit}
            </span>
          </div>
        )}
      </div>

      {points.length === 0 ? (
        <div
          className={`flex ${chartHeight} items-center justify-center text-sm text-muted-foreground`}
        >
          Not enough data
        </div>
      ) : (
        <ChartContainer config={config} className={`${chartHeight} w-full`}>
          <ComposedChart
            data={points}
            margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
            accessibilityLayer
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--color-border)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(ts: number) => formatMonthDay(ts, tz)}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
            />
            <YAxis
              domain={yDomain ?? ["auto", "auto"]}
              tickLine={false}
              axisLine={false}
              width={32}
              tickFormatter={(v: number) => formatValue(v)}
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--color-primary)", strokeOpacity: 0.4 }}
              content={({ active, payload, label: rawLabel }) => {
                if (!active || !payload || payload.length === 0) return null;
                const ts =
                  typeof rawLabel === "number"
                    ? rawLabel
                    : typeof rawLabel === "string" && !Number.isNaN(Number(rawLabel))
                      ? Number(rawLabel)
                      : null;
                // The point's full row carries every aggregate field
                // for the day. Pull straight from there instead of
                // hunting through `payload` entries — Recharts attaches
                // the original data row as `payload[i].payload`.
                const row = payload[0].payload as {
                  ts: number;
                  min: number | null;
                  max: number | null;
                  mean: number | null;
                  sum: number | null;
                  range: [number | null, number | null];
                  compareMean: number | null;
                  compareMax: number | null;
                  compareSum: number | null;
                };
                const hasData =
                  variant === "sum"
                    ? row.sum != null && Number.isFinite(row.sum)
                    : variant === "max"
                      ? row.max != null && Number.isFinite(row.max)
                      : row.mean != null && Number.isFinite(row.mean);
                // For sum-style metrics (rain), most days at year
                // scale are dry. We previously returned `null` here
                // to suppress the tooltip on zero/zero days, but
                // that left dead hover regions with no explanation.
                // Now: render a minimal "No rain" message so the
                // cursor cue stays informative without the spam of
                // "0.00 in" rows. The full tooltip reappears when
                // either current OR compare day has actual rain.
                const dryCurrent = (row.sum ?? 0) === 0;
                const dryCompare = (row.compareSum ?? 0) === 0;
                if (variant === "sum" && dryCurrent && dryCompare) {
                  return (
                    <div className="grid min-w-[140px] gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                      {ts != null && (
                        <div className="border-b border-border/40 pb-1 font-medium tabular">
                          {formatMonthDay(ts, tz)}
                        </div>
                      )}
                      <div className="text-muted-foreground italic">
                        No rain
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="grid min-w-[180px] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                    {ts != null && (
                      <div className="border-b border-border/40 pb-1 font-medium tabular">
                        {formatMonthDay(ts, tz)}
                      </div>
                    )}
                    {!hasData && (
                      <div className="text-muted-foreground italic">
                        No data
                      </div>
                    )}
                    {hasData && variant === "range" && (
                      <>
                        <TooltipRow
                          color={color}
                          swatchKind="band"
                          label={`${label} range`}
                          value={
                            row.min != null && row.max != null
                              ? `${formatValue(row.min)} – ${formatValue(row.max)}`
                              : "—"
                          }
                          unit={unit}
                        />
                        {row.mean != null && (
                          <TooltipRow
                            color={color}
                            swatchKind="line"
                            label="Daily avg"
                            value={formatValue(row.mean)}
                            unit={unit}
                          />
                        )}
                      </>
                    )}
                    {hasData && variant === "mean" && row.mean != null && (
                      <TooltipRow
                        color={color}
                        swatchKind="line"
                        label="Daily avg"
                        value={formatValue(row.mean)}
                        unit={unit}
                      />
                    )}
                    {hasData && variant === "max" && row.max != null && (
                      <TooltipRow
                        color={color}
                        swatchKind="line"
                        label="Daily peak"
                        value={formatValue(row.max)}
                        unit={unit}
                      />
                    )}
                    {hasData && variant === "sum" && row.sum != null && (
                      <TooltipRow
                        color={color}
                        swatchKind="bar"
                        label="Daily total"
                        value={formatValue(row.sum)}
                        unit={unit}
                      />
                    )}
                    {compare &&
                      (variant === "range" || variant === "mean") &&
                      row.compareMean != null && (
                        <TooltipRow
                          color="var(--muted-foreground)"
                          swatchKind="dashed"
                          label="Previous period"
                          value={formatValue(row.compareMean)}
                          unit={unit}
                        />
                      )}
                    {compare &&
                      variant === "max" &&
                      row.compareMax != null && (
                        <TooltipRow
                          color="var(--muted-foreground)"
                          swatchKind="dashed"
                          label="Previous peak"
                          value={formatValue(row.compareMax)}
                          unit={unit}
                        />
                      )}
                    {compare &&
                      variant === "sum" &&
                      row.compareSum != null && (
                        <TooltipRow
                          color="var(--muted-foreground)"
                          swatchKind="bar"
                          label="Previous total"
                          value={formatValue(row.compareSum)}
                          unit={unit}
                        />
                      )}
                  </div>
                );
              }}
            />

            {variant === "range" && (
              <Area
                type="monotone"
                dataKey="range"
                stroke="none"
                fill="var(--color-range)"
                fillOpacity={0.2}
                isAnimationActive={false}
              />
            )}
            {/* Compare line drawn first (behind the current line) so
                the headline series stays visually dominant. We do NOT
                set `connectNulls` here: a missing day in the previous
                period should appear as a break, not a smooth bridge —
                compare mode is for like-for-like reading, and bridging
                hides exactly the data-loss the overlay should reveal. */}
            {/* Compare line gets a bit more visual presence at long
                range (≥120 days) — at year scale the main line's
                density was burying the dashed comparison line. The
                stronger stroke + tighter dash + higher opacity
                roughly matches the visual weight of the (now dot-
                less) main line so the comparison reads as a peer. */}
            {compare && (variant === "range" || variant === "mean") && (
              <Line
                type="monotone"
                dataKey="compareMean"
                stroke="var(--color-compareMean)"
                strokeWidth={data.length > 120 ? 1.75 : 1.25}
                strokeDasharray={data.length > 120 ? "5 4" : "3 3"}
                strokeOpacity={data.length > 120 ? 0.85 : 0.7}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {compare && variant === "max" && (
              <Line
                type="monotone"
                dataKey="compareMax"
                stroke="var(--color-compareMax)"
                strokeWidth={data.length > 120 ? 1.75 : 1.25}
                strokeDasharray={data.length > 120 ? "5 4" : "3 3"}
                strokeOpacity={data.length > 120 ? 0.85 : 0.7}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {/* Main line dots scale down (or vanish) as data density
                rises so they don't crowd out the dashed compare line
                at year scale. Empirical thresholds:
                  - ≤45 points: full r=2 dots (week/month views)
                  - 46-120 points: r=1 dots (quarter)
                  - >120 points: no dots, just the line (year)
                Computed once per render, not inside the dot renderer
                callback, so it doesn't churn on hover events. */}
            {(variant === "range" || variant === "mean") && (
              <Line
                type="monotone"
                dataKey="mean"
                stroke="var(--color-mean)"
                strokeWidth={2}
                dot={
                  data.length > 120
                    ? false
                    : data.length > 45
                      ? { r: 1, fill: "var(--color-mean)" }
                      : { r: 2, fill: "var(--color-mean)" }
                }
                isAnimationActive={false}
              />
            )}
            {variant === "max" && (
              <Line
                type="monotone"
                dataKey="max"
                stroke="var(--color-max)"
                strokeWidth={2}
                dot={
                  data.length > 120
                    ? false
                    : data.length > 45
                      ? { r: 1, fill: "var(--color-max)" }
                      : { r: 2, fill: "var(--color-max)" }
                }
                isAnimationActive={false}
              />
            )}
            {/* Compare bar for sum-style metrics (rain). Rendered
                BEHIND the main bars at lower opacity so the current-
                period totals lead while last-year's totals provide
                visual context. Same color as the main bar so the
                connection reads at a glance — no separate legend
                needed. */}
            {variant === "sum" && compare && (
              <Bar
                dataKey="compareSum"
                fill="var(--color-sum)"
                fillOpacity={0.25}
                stroke="var(--color-sum)"
                strokeOpacity={0.4}
                strokeWidth={1}
                radius={[2, 2, 0, 0]}
              />
            )}
            {variant === "sum" && (
              <Bar
                dataKey="sum"
                fill="var(--color-sum)"
                radius={[2, 2, 0, 0]}
              />
            )}
          </ComposedChart>
        </ChartContainer>
      )}
    </Card>
  );
}

// `TooltipRow` lives in `./DailyAggregateChartTooltip.tsx`. The
// swatch-shape logic adds ~45 lines that didn't need to share scope
// with the chart component.
