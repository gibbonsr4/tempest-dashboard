"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";

/**
 * Compact bar histogram for "shape of activity over time" — used by
 * the rain and lightning expanded views to render the day's storm
 * intensity. Bars not lines: rain and lightning are bursty, and bars
 * make dry gaps + intensity spikes obvious in a way smoothed lines
 * don't.
 *
 * The component is purely presentational. Callers pre-filter samples
 * to the window they want shown and pass `startMs`/`endMs`. A typical
 * caller chooses `[max(first_event_today, now − 3h), now]` so a single
 * recent burst still renders a readable bar shape, while a long storm
 * gets the full timeline. Returns `null` if all bucket totals are
 * zero — the chart's job is to communicate intensity, not absence.
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
  buckets = 24,
  color = "currentColor",
  ariaLabel,
}: {
  samples: { ts: number; value: number }[];
  startMs: number;
  endMs: number;
  tz: string;
  buckets?: number;
  color?: string;
  ariaLabel?: string;
}) {
  // Bucket the samples up front so we can early-return when there's
  // truly nothing to show.
  const bucketTotals = React.useMemo(() => {
    const span = Math.max(1, endMs - startMs);
    const bucketMs = span / buckets;
    const totals = new Array(buckets).fill(0);
    for (const s of samples) {
      if (s.ts < startMs || s.ts >= endMs) continue;
      if (typeof s.value !== "number" || !Number.isFinite(s.value)) continue;
      const idx = Math.min(buckets - 1, Math.floor((s.ts - startMs) / bucketMs));
      totals[idx] += s.value;
    }
    return totals;
  }, [samples, startMs, endMs, buckets]);

  const maxTotal = bucketTotals.reduce((a, b) => Math.max(a, b), 0);
  if (maxTotal <= 0) return null;

  // Build a screen-reader-friendly description of the chart's
  // domain + intensity. Sighted users get the visual bars + the
  // muted time labels below the SVG, but those labels are
  // `aria-hidden` (the surrounding `preserveAspectRatio="none"`
  // would also distort glyphs inside the SVG, so we keep them as
  // HTML overlays). Without the description an AT user gets only
  // a generic "Rain intensity over the storm window" — true but
  // useless. This adds the actual range + total.
  const totalSum = bucketTotals.reduce((a, b) => a + b, 0);
  const describedAria = ariaLabel
    ? `${ariaLabel}, ${formatStormTime(startMs, endMs - startMs, tz)} to now, total ${totalSum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : undefined;

  const VIEW_W = 600;
  const VIEW_H = 64;
  const PADDING_X = 4;
  // Leave 1px headroom so the tallest bar doesn't clip against the top
  // edge, and the baseline anchored to the SVG bottom (we render time
  // labels as HTML overlays underneath the SVG, not inside it).
  const BASELINE_Y = VIEW_H - 1;
  const HEADROOM = 1;

  const barWidth = (VIEW_W - PADDING_X * 2) / buckets;
  // 70% of the slot width gives a visible gap between bars without
  // making them feel skeletal.
  const innerBarWidth = barWidth * 0.72;
  const barOffset = (barWidth - innerBarWidth) / 2;

  // Three time anchors — start, midpoint, now. Format adapts to the
  // window length so a 3-hour storm doesn't end up labeled in days.
  const midMs = startMs + (endMs - startMs) / 2;
  const labels = [
    { ms: startMs, align: "start" as const },
    { ms: midMs, align: "center" as const },
    { ms: endMs, align: "end" as const, override: "now" },
  ];

  return (
    <div className="relative w-full" aria-hidden={!ariaLabel || undefined}>
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
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={innerBarWidth}
              height={h}
              fill={color}
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
