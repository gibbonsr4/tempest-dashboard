"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card } from "@/components/ui/card";
import type { HistorySample } from "@/lib/hooks/useRecentHistory";
import { formatClock, formatMonthDay } from "@/lib/tempest/format";
import { useStationTz } from "@/lib/tempest/tz-context";

/**
 * Generic time-series chart for a single metric over a configurable
 * range. Reads from the server-fetched history payload, projects to
 * one numeric field, and renders a Recharts line/area/bar inside a
 * shadcn `ChartContainer` so it inherits theme tokens automatically.
 *
 * The X axis adapts to range:
 * - <= 36h: hour labels (e.g. "3 PM")
 * - >  36h: month/day labels (e.g. "Apr 24")
 */
export function MetricChart({
  data,
  pick,
  label,
  unit,
  color = "var(--chart-1)",
  kind = "line",
  hours,
  formatValue = (v) => v.toFixed(1),
  yDomain,
  className,
  chartHeight = "h-40",
  hideLabel = false,
}: {
  data: HistorySample[];
  pick: (s: HistorySample) => number | null;
  label: string;
  unit: string;
  /** CSS color string. Use `var(--chart-N)` to inherit theme tokens. */
  color?: string;
  kind?: "line" | "area" | "bar";
  hours: number;
  formatValue?: (v: number) => string;
  yDomain?: [number | "auto", number | "auto"];
  className?: string;
  /**
   * Tailwind class controlling the height of the chart's plot area.
   * Defaults to `"h-40"` (the inline-grid size). The `ExpandableChart`
   * wrapper passes a taller value (e.g. `"h-[60vh]"`) when the chart
   * is rendered inside its dialog.
   */
  chartHeight?: string;
  /**
   * When `true`, the small uppercase `label` element is omitted from
   * the card header — the summary stats are still rendered. Used by
   * `ExpandableChart`, which already shows the metric name in its
   * `DialogTitle` and would otherwise duplicate the label inside.
   */
  hideLabel?: boolean;
}) {
  const tz = useStationTz();
  // Per-instance gradient id so two area-kind charts on the same page
  // don't collide on `<defs>` references.
  const reactId = React.useId();
  const gradientId = `metric-area-${reactId}`;

  // Keep null entries in the series — Recharts renders gaps at nulls
  // when `connectNulls` is unset, which is what we want for outage
  // periods. Filtering nulls out (the previous behavior) made multi-
  // hour outages render as smooth lines that misled trend reading
  // (R7).
  const points = React.useMemo(() => {
    return data.map((s) => {
      const v = pick(s);
      return {
        ts: s.ts,
        value: v != null && Number.isFinite(v) ? v : null,
      };
    });
  }, [data, pick]);

  const summary = React.useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;
    for (const p of points) {
      if (p.value == null) continue;
      if (p.value < min) min = p.value;
      if (p.value > max) max = p.value;
      sum += p.value;
      count += 1;
    }
    if (count === 0) return null;
    return { min, max, avg: sum / count };
  }, [points]);

  const useDayLabels = hours > 36;

  const config = {
    value: { label, color },
  } satisfies ChartConfig;

  const fmtX = (ts: number) =>
    useDayLabels ? formatMonthDay(ts, tz) : formatClock(ts, tz).replace(":00", "");

  const fmtTooltipLabel = (raw: unknown) => {
    const ts =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && !Number.isNaN(Number(raw))
          ? Number(raw)
          : null;
    if (ts == null) return "";
    return useDayLabels
      ? `${formatMonthDay(ts, tz)} · ${formatClock(ts, tz)}`
      : formatClock(ts, tz);
  };

  return (
    <Card className={className ?? "p-4"}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        {!hideLabel && (
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
        )}
        {summary && (
          <div className="flex gap-3 text-[11px] text-muted-foreground tabular">
            <span>
              min{" "}
              <span className="text-foreground">
                {formatValue(summary.min)}
              </span>
            </span>
            <span>
              avg{" "}
              <span className="text-foreground">
                {formatValue(summary.avg)}
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

      {summary == null ? (
        <div className={`flex ${chartHeight} items-center justify-center text-sm text-muted-foreground`}>
          Not enough data
        </div>
      ) : (
        <ChartContainer config={config} className={`${chartHeight} w-full`}>
          {renderChart({
            kind,
            points,
            fmtX,
            fmtTooltipLabel,
            formatValue,
            gradientId,
            yDomain,
            label,
            color,
            unit,
          })}
        </ChartContainer>
      )}
    </Card>
  );
}

function renderChart({
  kind,
  points,
  fmtX,
  fmtTooltipLabel,
  formatValue,
  gradientId,
  yDomain,
  label,
  color,
  unit,
}: {
  kind: "line" | "area" | "bar";
  points: { ts: number; value: number | null }[];
  fmtX: (ts: number) => string;
  fmtTooltipLabel: (raw: unknown) => string;
  formatValue: (v: number) => string;
  gradientId: string;
  yDomain?: [number | "auto", number | "auto"];
  label: string;
  color: string;
  unit: string;
}) {
  const common = {
    accessibilityLayer: true,
    data: points,
    margin: { top: 4, right: 4, bottom: 0, left: 4 },
  } as const;

  const xAxis = (
    <XAxis
      dataKey="ts"
      type="number"
      domain={["dataMin", "dataMax"]}
      tickFormatter={fmtX}
      tickLine={false}
      axisLine={false}
      minTickGap={48}
      tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
    />
  );
  const yAxis = (
    <YAxis
      domain={yDomain ?? ["auto", "auto"]}
      tickLine={false}
      axisLine={false}
      width={32}
      tickFormatter={(v: number) => formatValue(v)}
      tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
    />
  );
  const grid = (
    <CartesianGrid
      vertical={false}
      stroke="var(--color-border)"
      strokeDasharray="3 3"
    />
  );
  const tooltip = (
    <ChartTooltip
      cursor={{ stroke: "var(--color-primary)", strokeOpacity: 0.4 }}
      content={({ active, payload, label: rawLabel }) => {
        if (!active || !payload || payload.length === 0) return null;
        const item = payload[0];
        if (typeof item.value !== "number") return null;
        const header = fmtTooltipLabel(rawLabel);
        return (
          <div className="grid min-w-[140px] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
            {header && (
              <div className="border-b border-border/40 pb-1 font-medium tabular">
                {header}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: color }}
              />
              <span className="text-muted-foreground">{label}</span>
              <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                {formatValue(item.value)}
                <span className="ml-0.5 text-[10px] text-muted-foreground">
                  {unit}
                </span>
              </span>
            </div>
          </div>
        );
      }}
    />
  );

  if (kind === "bar") {
    return (
      <BarChart {...common}>
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        <Bar dataKey="value" fill="var(--color-value)" radius={[2, 2, 0, 0]} />
      </BarChart>
    );
  }
  if (kind === "area") {
    return (
      <AreaChart {...common}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    );
  }
  return (
    <LineChart {...common}>
      {grid}
      {xAxis}
      {yAxis}
      {tooltip}
      <Line
        dataKey="value"
        type="monotone"
        stroke="var(--color-value)"
        strokeWidth={2}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}
