"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";
import { formatClock } from "@/lib/tempest/format";

/**
 * Compact bar histogram for "shape of activity over time" — used by
 * the rain and lightning expanded views to render the day's storm
 * intensity. Bars not lines: rain and lightning are bursty, and bars
 * make dry gaps + intensity spikes obvious in a way smoothed lines
 * don't.
 *
 * Bucket width is set by the caller via `bucketMs` rather than
 * derived per-card. The storm panel pairs rain + lightning, so the
 * caller computes one width from the underlying history cadence and
 * passes it to both — guaranteeing identical x-axes (e.g. both at
 * 30-min bars) instead of each card snapping to a different size.
 *
 * The component is purely presentational. Callers pre-filter samples
 * to the window they want shown and pass `startMs`/`endMs`. The chart
 * snaps its left edge backward to a clean `bucketMs` boundary so bars
 * + tooltip times land on whole-minute steps.
 *
 * Time labels (start / midpoint / now) render as fixed-pixel HTML
 * overlays below the SVG so the parent SVG's
 * `preserveAspectRatio="none"` stretching can't distort the glyphs
 * — same approach used by HorizonBand.
 */
export function StormHistogram({
  samples,
  startMs,
  endMs,
  tz,
  bucketMs,
  color = "currentColor",
  ariaLabel,
  label,
  unit,
  formatValue = (v) => v.toFixed(2),
}: {
  samples: { ts: number; value: number }[];
  startMs: number;
  endMs: number;
  tz: string;
  /** Width of each bar in milliseconds. Required — callers compute
   *  this once at the storm-panel level (from history sample
   *  cadence, snapped to a clean minute step) and pass the same
   *  value to both rain and lightning histograms so paired charts
   *  have matching x-axes. The chart's left edge is also aligned
   *  backward to a clean `bucketMs` boundary so tooltip ranges
   *  read like "9:30a–10:00a" rather than "9:35a–10:05a". */
  bucketMs: number;
  color?: string;
  ariaLabel?: string;
  /** Tooltip metric name, e.g. "Rain" or "Lightning". */
  label: string;
  /** Tooltip unit suffix, e.g. "in" or "strikes". */
  unit: string;
  /** Tooltip value formatter; receives the bucket total in the same
   *  unit-system as the input samples. Default: `toFixed(2)`. */
  formatValue?: (v: number) => string;
}) {
  // Snap the chart's left edge backward to a clean `bucketMs`
  // boundary so bars + tooltip times land on whole-minute steps
  // (e.g. 9:30a, 10:00a) instead of the raw fractional epoch.
  const alignedStartMs = Math.floor(startMs / bucketMs) * bucketMs;
  const buckets = Math.max(
    1,
    Math.ceil((endMs - alignedStartMs) / bucketMs),
  );

  const bucketTotals = React.useMemo(() => {
    const totals = new Array(buckets).fill(0);
    for (const s of samples) {
      if (s.ts < alignedStartMs || s.ts >= endMs) continue;
      if (typeof s.value !== "number" || !Number.isFinite(s.value)) continue;
      const idx = Math.min(
        buckets - 1,
        Math.floor((s.ts - alignedStartMs) / bucketMs),
      );
      totals[idx] += s.value;
    }
    return totals;
  }, [samples, alignedStartMs, endMs, buckets, bucketMs]);

  const maxTotal = bucketTotals.reduce((a, b) => Math.max(a, b), 0);

  const totalSum = bucketTotals.reduce((a, b) => a + b, 0);
  const describedAria = ariaLabel
    ? `${ariaLabel}, ${formatStormTime(alignedStartMs, endMs - alignedStartMs, tz)} to now, total ${formatValue(totalSum)} ${unit}`
    : undefined;

  // Hover tracking — `activeIdx` is the bucket the cursor is over,
  // null when outside the chart. Mouse-tracking overlay is closer to
  // how Recharts handles MetricChart on the History tab than wiring
  // up Radix Tooltip per `<rect>`, and avoids N tooltip nodes for a
  // single tooltip readout.
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = React.useState<number | null>(null);

  if (maxTotal <= 0) return null;

  const VIEW_W = 600;
  const VIEW_H = 64;
  const PADDING_X = 4;
  const BASELINE_Y = VIEW_H - 1;
  const HEADROOM = 1;

  const barWidth = (VIEW_W - PADDING_X * 2) / buckets;
  const innerBarWidth = barWidth * 0.72;
  const barOffset = (barWidth - innerBarWidth) / 2;

  const span = endMs - alignedStartMs;
  const midMs = alignedStartMs + span / 2;
  const labels = [
    { ms: alignedStartMs, align: "start" as const },
    { ms: midMs, align: "center" as const },
    { ms: endMs, align: "end" as const, override: "now" },
  ];

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const fracX = (e.clientX - rect.left) / rect.width;
    if (fracX < 0 || fracX > 1) {
      setActiveIdx(null);
      return;
    }
    // Convert from screen-fraction to viewBox-x, then to bucket index.
    const viewX = fracX * VIEW_W;
    const bucketX = viewX - PADDING_X;
    const idx = Math.floor(bucketX / barWidth);
    if (idx < 0 || idx >= buckets) {
      setActiveIdx(null);
      return;
    }
    setActiveIdx(idx);
  };

  const handleMouseLeave = () => setActiveIdx(null);

  // Active bucket → tooltip data. Position the tooltip above the
  // active bar's left edge, transformed to center on the bar. Header
  // shows the bucket's full time range — values are sums over that
  // range, so just a midpoint timestamp would leave the user
  // guessing whether "0.16 in" fell in 5 min or 30.
  let tooltip: React.ReactNode = null;
  if (activeIdx != null) {
    const v = bucketTotals[activeIdx];
    if (v > 0) {
      const bucketStart = alignedStartMs + activeIdx * bucketMs;
      // Last bucket's end caps at `now` so the right edge reads
      // "…–now" rather than a future-looking timestamp.
      const bucketEnd = Math.min(
        endMs,
        alignedStartMs + (activeIdx + 1) * bucketMs,
      );
      const startLabel = formatClock(bucketStart, tz);
      const endLabel =
        activeIdx === buckets - 1 ? "now" : formatClock(bucketEnd, tz);
      // Clamp the tooltip's center so first/last buckets don't push
      // it off the chart's left/right edges. ~7% of width covers the
      // tooltip's half-width at typical sizes; the `min-w-[140px]`
      // class keeps content readable even when clamped.
      const rawFrac = (PADDING_X + activeIdx * barWidth + barWidth / 2) / VIEW_W;
      const tooltipFrac = Math.min(0.93, Math.max(0.07, rawFrac));
      tooltip = (
        <div
          className="pointer-events-none absolute bottom-full mb-2 z-10 grid min-w-[140px] -translate-x-1/2 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: `${tooltipFrac * 100}%` }}
        >
          <div className="border-b border-border/40 pb-1 font-medium tabular">
            {startLabel}–{endLabel}
          </div>
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: color }}
            />
            <span className="text-muted-foreground">{label}</span>
            <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
              {formatValue(v)}
              <span className="ml-0.5 text-[10px] text-muted-foreground">
                {unit}
              </span>
            </span>
          </div>
        </div>
      );
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      aria-hidden={!ariaLabel || undefined}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {tooltip}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height={VIEW_H}
        preserveAspectRatio="none"
        role={ariaLabel ? "img" : undefined}
        aria-label={describedAria}
        className="block"
      >
        {/* Faint baseline so an all-empty stretch still has a place
            for the eye to rest. */}
        <line
          x1={0}
          x2={VIEW_W}
          y1={BASELINE_Y}
          y2={BASELINE_Y}
          stroke="currentColor"
          strokeOpacity={0.12}
        />
        {bucketTotals.map((v, i) => {
          if (v <= 0) return null;
          const h = (v / maxTotal) * (BASELINE_Y - HEADROOM);
          const x = PADDING_X + i * barWidth + barOffset;
          const y = BASELINE_Y - h;
          const isActive = activeIdx === i;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={innerBarWidth}
              height={h}
              fill={color}
              fillOpacity={isActive ? 1 : 0.85}
              rx={0.5}
            />
          );
        })}
      </svg>
      <div
        className="relative mt-1 h-3 text-[10px] text-muted-foreground tabular"
        aria-hidden
      >
        {labels.map((label, i) => {
          const text = label.override ?? formatStormTime(label.ms, endMs - startMs, tz);
          const style: React.CSSProperties =
            label.align === "start"
              ? { left: 0 }
              : label.align === "end"
                ? { right: 0 }
                : { left: "50%", transform: "translateX(-50%)" };
          return (
            <span key={i} className="absolute leading-none" style={style}>
              {text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Time formatter for histogram tick labels. For windows ≤ 8 hours
 * shows hours+minutes ("3:42p"); for longer windows shows hour-only
 * ("3p") to keep the labels short. The window is ALWAYS within today
 * by construction (storm window is anchored to current day), so we
 * don't need to disambiguate dates.
 */
function formatStormTime(ms: number, spanMs: number, tz: string): string {
  const useMinutes = spanMs <= 8 * 3600_000;
  return formatInTimeZone(new Date(ms), tz, useMinutes ? "h:mma" : "ha")
    .toLowerCase()
    .replace(":00", "")
    .replace("am", "a")
    .replace("pm", "p");
}
