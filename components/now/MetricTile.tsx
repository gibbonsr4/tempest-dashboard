import * as React from "react";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/shared/Sparkline";
import type { MetricStatus } from "@/lib/tempest/interpret";
import { cn } from "@/lib/utils";

/**
 * Unified shell for the four numeric tiles (humidity, pressure, UV,
 * AQI). Every tile renders the same shape:
 *
 *   ┌─LABEL──────────────────● Status─┐
 *   │  big value  unit       sparkline│  (sparkline desktop-only)
 *   │  optional detail line           │
 *   └─────────────────────────────────┘
 *
 * `status` is the unified `{ label, color }` chip we use across every
 * card so there's one consistent visual language for "where this
 * reading falls".
 *
 * Sparklines: rendered only on `sm` and up (`hidden sm:block`). They
 * were briefly removed entirely after a pass found that at 56–80px
 * mobile widths they read as decorative noise — and the pressure
 * tile's value+unit+arrow group specifically collided with the
 * sparkline column. Hiding them on mobile keeps the value cluster
 * readable there; on desktop each tile has 200+px of headroom so the
 * 80-px trend strip fits cleanly with no collisions. The pressure
 * sparkline plots station pressure (the basis the history payload
 * carries) while the headline shows sea-level pressure — the absolute
 * values differ by a constant elevation offset, but the *shape* of
 * the trend is identical, so the line still correctly answers "is it
 * rising or falling?".
 */
export function MetricTile({
  label,
  value,
  unit,
  status,
  detail,
  prefix,
  spark,
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: React.ReactNode;
  status?: MetricStatus | null;
  detail?: React.ReactNode;
  /** Optional inline glyph rendered next to the unit (currently the
   *  pressure card's trend arrow). Sits inside the value/unit flex
   *  group, after the unit. */
  prefix?: React.ReactNode;
  /** Trend values for the inline sparkline (desktop only). At least
   *  two points required for the line to render — fewer renders
   *  nothing rather than a degenerate single-point glyph. */
  spark?: number[];
  className?: string;
}) {
  // Layout strategy: header + value cluster stay TIGHT at the top
  // (they form a "what's this reading?" descriptor pair — e.g.
  // "HUMIDITY 20%" — and want to read as one group). The detail
  // line pins to the bottom via `mt-auto`, so when the parent grid
  // stretches a row to match the tallest sibling, only the gap
  // BETWEEN value and detail absorbs the extra space. Header and
  // value stay glued.
  //
  // We deliberately do NOT use `justify-between` here even though
  // the History tab's PersonalRecords does. That pattern works in
  // PersonalRecords because the value is `text-3xl font-light` —
  // visually dominant — with tiny label and date as accessories
  // distributed around it. In MetricTile the value is paired with
  // a sparkline and sits next to a labelled header; splitting the
  // descriptor pair with extra whitespace breaks the visual
  // grouping.
  return (
    <Card className={cn("flex flex-col gap-2 p-4", className)}>
      {/* `flex-wrap` lets a long status label (e.g. AirNow's
          "Unhealthy for Sensitive Groups") drop to a second line on
          narrow tiles instead of crushing the column label next to
          it. gap-y-1 keeps the second-line spacing tight. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        {status && <StatusChip status={status} />}
      </div>
      {/* `justify-between` only matters on desktop where the sparkline
          actually renders; on mobile the sparkline is `display: none`
          and the value cluster naturally left-aligns as the sole flex
          child. */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className="tabular text-2xl font-medium">{value}</span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
          {prefix && <span className="ml-1 text-lg text-primary">{prefix}</span>}
        </div>
        {spark && spark.length > 1 && (
          <div className="hidden w-[80px] shrink-0 text-primary/70 sm:block">
            <Sparkline
              values={spark}
              width={80}
              height={22}
              strokeColor="currentColor"
              ariaLabel={`${label} trend`}
            />
          </div>
        )}
      </div>
      {/* `mt-auto` pins the detail to the bottom of a stretched
          card. When the card is at its natural height, `mt-auto`
          becomes a no-op and the existing `gap-2` rules. Conditional
          rendering when detail is missing — without `justify-between`
          there's nothing to break, the header + value just sit at
          the top of a (potentially-stretched) card. */}
      {detail && (
        <div className="mt-auto text-xs text-muted-foreground">{detail}</div>
      )}
    </Card>
  );
}

function StatusChip({ status }: { status: MetricStatus }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] tracking-normal normal-case"
      style={{ color: status.color }}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ backgroundColor: status.color }}
      />
      {status.label}
    </span>
  );
}
