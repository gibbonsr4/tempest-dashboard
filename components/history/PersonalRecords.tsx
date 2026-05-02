"use client";

import * as React from "react";
import {
  Droplets,
  Flame,
  Gauge,
  Snowflake,
  Sun,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import type { HistorySample } from "@/lib/hooks/useRecentHistory";
import {
  cToF,
  mbToInHg,
  mmToIn,
  mpsToMph,
} from "@/lib/tempest/conversions";
import { formatClock, formatMonthDay, startOfStationDay } from "@/lib/tempest/format";
import type { DeviceDailyAggregate } from "@/lib/tempest/server-client";
import { useStationTz } from "@/lib/tempest/tz-context";

/**
 * Records strip — peaks across the visible window. Designed to read
 * at a glance: large value, supporting unit, then a small label and
 * timestamp underneath.
 *
 * Two input modes:
 *   - **`kind: "samples"`** — sub-daily HistorySample[] (24h / 7d / 30d
 *     ranges). Walk every sample, find the row containing each metric's
 *     extreme. Records can pinpoint time-of-day.
 *   - **`kind: "daily"`** — DeviceDailyAggregate[] (90d / YTD / 1y).
 *     Walk every daily row, find the day with each metric's extreme.
 *     Time-of-day isn't known (we only have daily aggregates), so the
 *     timestamp shows date-only and "Wettest sample" becomes
 *     "Wettest day" since the metric IS a daily total.
 *
 * Title is a single static "Records" label across all ranges; the
 * actual span (e.g. "181 days", "24 hours") is shown on the right
 * of the header row. This avoids the trap of trying to summarize a
 * range like a 181-day YTD as either "year" or "quarter" peaks —
 * the user just sees the literal day count.
 */

type Props =
  | { kind: "samples"; samples: HistorySample[]; hours: number }
  | { kind: "daily"; rows: DeviceDailyAggregate[]; days: number };

/**
 * Internal "best record" type — carries the metric's display value
 * plus the station-local epoch ms it occurred at. Both code paths
 * (samples + daily) produce one of these per metric.
 */
interface RecordItem {
  /** Epoch ms — sample's exact timestamp (samples branch) or the
   *  day's station-local midnight (daily branch). */
  tsMs: number;
  /** Numeric value already converted to display units. */
  displayValue: number;
}

interface RecordSet {
  hottest: RecordItem | null;
  coldest: RecordItem | null;
  biggestGust: RecordItem | null;
  wettest: RecordItem | null;
  highestUv: RecordItem | null;
  highestPressure: RecordItem | null;
}

export function PersonalRecords(props: Props) {
  const tz = useStationTz();

  const records = React.useMemo<RecordSet>(() => {
    if (props.kind === "samples") return computeFromSamples(props.samples);
    return computeFromDaily(props.rows, tz);
  }, [props, tz]);

  const showTime = props.kind === "samples";
  const hours =
    props.kind === "samples" ? props.hours : props.days * 24;
  // Span shown on the right of the header — hours when the window is
  // a day or less, days otherwise. Mirrors the count display on the
  // Wind by Month card (which says "181 days" etc.) so the two cards
  // read as a pair when sitting side-by-side.
  const spanLabel =
    hours <= 24
      ? `${Math.round(hours)} hours`
      : `${Math.round(hours / 24)} days`;

  // "Wettest sample" / "Wettest day" — same metric, different label
  // depending on what the underlying data IS. Sub-daily samples can
  // resolve to a single per-bucket peak; daily aggregates only have
  // a daily total to talk about.
  const wettestLabel =
    props.kind === "daily" ? "Wettest day" : "Wettest sample";

  // Each tile's icon color references a single CSS var defined in
  // `app/globals.css` (--icon-flame, --icon-cold, etc.). Light/dark
  // variants flip there; this component just consumes the tokens.
  const items: {
    label: string;
    icon: LucideIcon;
    color: string;
    value: RecordItem | null;
    format: (v: number) => string;
    unit?: string;
  }[] = [
    {
      label: "Hottest",
      icon: Flame,
      color: "var(--icon-flame)",
      value: records.hottest,
      format: (v) => `${Math.round(v)}`,
      unit: "°F",
    },
    {
      label: "Coldest",
      icon: Snowflake,
      color: "var(--icon-cold)",
      value: records.coldest,
      format: (v) => `${Math.round(v)}`,
      unit: "°F",
    },
    {
      label: "Biggest gust",
      icon: Wind,
      color: "var(--primary)",
      value: records.biggestGust,
      format: (v) => v.toFixed(1),
      unit: "mph",
    },
    {
      label: wettestLabel,
      icon: Droplets,
      color: "var(--icon-rain)",
      value: records.wettest,
      format: (v) => v.toFixed(2),
      unit: "in",
    },
    {
      label: "Highest UV",
      icon: Sun,
      color: "var(--icon-sun)",
      value: records.highestUv,
      format: (v) => v.toFixed(1),
    },
    {
      label: "Highest pressure",
      icon: Gauge,
      color: "var(--icon-pressure)",
      value: records.highestPressure,
      format: (v) => v.toFixed(2),
      unit: "inHg",
    },
  ];

  return (
    <Card className="flex flex-col p-4">
      {/* Header mirrors the Wind by Month card — title + subtitle on
          the left, span count on the right — so when the two cards
          sit side-by-side at lg+ their headers occupy the same height
          and the inner tile rows line up vertically. */}
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Records
          </div>
          <div className="text-[10px] text-muted-foreground/70">
            Highs, lows, and peaks
          </div>
        </div>
        <div className="tabular text-[11px] text-muted-foreground">
          {spanLabel}
        </div>
      </div>
      {/* `flex-1 auto-rows-fr` mirrors the Wind by Month card — the
          ul fills the remaining card height, and the tile rows are
          equal-height fractional units. When the two cards sit
          side-by-side in `lg:grid-cols-2`, CSS grid's default
          `align-items: stretch` already equalizes the card heights;
          this just makes sure the tiles inside *also* fill that
          equal height, so the inner content bottoms line up across
          ranges (181d, 365d, etc.) instead of one card filling and
          the other leaving empty space. */}
      <ul className="grid flex-1 auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(({ label, icon: Icon, color, value, format, unit }) => (
          // Same layout strategy as `<MetricTile />` on the Now tab:
          // label + value stay TIGHT at the top (they form a
          // "category + achievement" pair — e.g. "HOT 105°F" — and
          // want to read as one record), with the date pinned to
          // the bottom via `mt-auto`. When `auto-rows-fr` stretches
          // a tile to match a taller sibling, only the gap between
          // value and date absorbs the extra height. Previously
          // this used `justify-between`, which scattered all three
          // sections across the stretched height and broke the
          // record's reading flow.
          <li
            key={label}
            className="flex flex-col gap-1 rounded-lg border border-border/50 bg-card/40 p-3"
          >
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Icon className="size-3.5" style={{ color }} aria-hidden />
              {label}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="tabular text-3xl font-light leading-none tracking-tight">
                {value ? format(value.displayValue) : "—"}
              </span>
              {unit && (
                <span className="text-sm text-muted-foreground">{unit}</span>
              )}
            </div>
            <div className="mt-auto text-[10px] tabular text-muted-foreground">
              {value
                ? showTime
                  ? `${formatMonthDay(value.tsMs, tz)} · ${formatClock(value.tsMs, tz)}`
                  : formatMonthDay(value.tsMs, tz)
                : "no data"}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── samples branch (sub-daily HistorySample[]) ──────────────────────

function computeFromSamples(samples: HistorySample[]): RecordSet {
  let hottest: HistorySample | null = null;
  let coldest: HistorySample | null = null;
  let biggestGust: HistorySample | null = null;
  let wettest: HistorySample | null = null;
  let highestUv: HistorySample | null = null;
  let highestPressure: HistorySample | null = null;

  for (const s of samples) {
    if (
      s.tempC != null &&
      (!hottest || (hottest.tempC != null && s.tempC > hottest.tempC))
    ) {
      hottest = s;
    }
    if (
      s.tempC != null &&
      (!coldest || (coldest.tempC != null && s.tempC < coldest.tempC))
    ) {
      coldest = s;
    }
    if (
      s.windGustMps != null &&
      (!biggestGust ||
        (biggestGust.windGustMps != null &&
          s.windGustMps > biggestGust.windGustMps))
    ) {
      biggestGust = s;
    }
    if (
      s.rainMm != null &&
      s.rainMm > 0 &&
      (!wettest || (wettest.rainMm != null && s.rainMm > wettest.rainMm))
    ) {
      wettest = s;
    }
    if (
      s.uv != null &&
      (!highestUv || (highestUv.uv != null && s.uv > highestUv.uv))
    ) {
      highestUv = s;
    }
    if (
      s.pressureMb != null &&
      (!highestPressure ||
        (highestPressure.pressureMb != null &&
          s.pressureMb > highestPressure.pressureMb))
    ) {
      highestPressure = s;
    }
  }

  return {
    hottest:
      hottest?.tempC != null
        ? { tsMs: hottest.ts, displayValue: cToF(hottest.tempC) }
        : null,
    coldest:
      coldest?.tempC != null
        ? { tsMs: coldest.ts, displayValue: cToF(coldest.tempC) }
        : null,
    biggestGust:
      biggestGust?.windGustMps != null
        ? {
            tsMs: biggestGust.ts,
            displayValue: mpsToMph(biggestGust.windGustMps),
          }
        : null,
    wettest:
      wettest?.rainMm != null
        ? { tsMs: wettest.ts, displayValue: mmToIn(wettest.rainMm) }
        : null,
    highestUv:
      highestUv?.uv != null
        ? { tsMs: highestUv.ts, displayValue: highestUv.uv }
        : null,
    highestPressure:
      highestPressure?.pressureMb != null
        ? {
            tsMs: highestPressure.ts,
            displayValue: mbToInHg(highestPressure.pressureMb),
          }
        : null,
  };
}

// ─── daily branch (DeviceDailyAggregate[]) ───────────────────────────

/**
 * Walk daily aggregates and find each metric's extreme. For temp,
 * Hottest reads `tempMaxC` and Coldest reads `tempMinC` — both
 * accurate annual extremes (vs. the synthesize-2-samples approach
 * we replaced, which could find a "coldest" that was just the day
 * with the lowest peak temp).
 *
 * The `tsMs` for each record is the matching day's station-local
 * midnight, derived from the row's `date` string. Display time
 * is dropped at the call site (showTime=false for daily) since
 * we only know the day, not the time.
 */
function computeFromDaily(
  rows: DeviceDailyAggregate[],
  tz: string,
): RecordSet {
  const dayMs = (date: string): number =>
    startOfStationDay(new Date(`${date}T12:00:00Z`).getTime(), tz);

  let hottestRow: DeviceDailyAggregate | null = null;
  let coldestRow: DeviceDailyAggregate | null = null;
  let biggestGustRow: DeviceDailyAggregate | null = null;
  let wettestRow: DeviceDailyAggregate | null = null;
  let highestUvRow: DeviceDailyAggregate | null = null;
  let highestPressureRow: DeviceDailyAggregate | null = null;

  for (const r of rows) {
    if (
      r.tempMaxC != null &&
      (!hottestRow ||
        (hottestRow.tempMaxC != null && r.tempMaxC > hottestRow.tempMaxC))
    ) {
      hottestRow = r;
    }
    if (
      r.tempMinC != null &&
      (!coldestRow ||
        (coldestRow.tempMinC != null && r.tempMinC < coldestRow.tempMinC))
    ) {
      coldestRow = r;
    }
    if (
      r.windGustMaxMps != null &&
      (!biggestGustRow ||
        (biggestGustRow.windGustMaxMps != null &&
          r.windGustMaxMps > biggestGustRow.windGustMaxMps))
    ) {
      biggestGustRow = r;
    }
    if (
      r.rainAccumFinalMm != null &&
      r.rainAccumFinalMm > 0 &&
      (!wettestRow ||
        (wettestRow.rainAccumFinalMm != null &&
          r.rainAccumFinalMm > wettestRow.rainAccumFinalMm))
    ) {
      wettestRow = r;
    }
    if (
      r.uvMax != null &&
      (!highestUvRow ||
        (highestUvRow.uvMax != null && r.uvMax > highestUvRow.uvMax))
    ) {
      highestUvRow = r;
    }
    if (
      r.pressureMaxMb != null &&
      (!highestPressureRow ||
        (highestPressureRow.pressureMaxMb != null &&
          r.pressureMaxMb > highestPressureRow.pressureMaxMb))
    ) {
      highestPressureRow = r;
    }
  }

  return {
    hottest:
      hottestRow?.tempMaxC != null
        ? {
            tsMs: dayMs(hottestRow.date),
            displayValue: cToF(hottestRow.tempMaxC),
          }
        : null,
    coldest:
      coldestRow?.tempMinC != null
        ? {
            tsMs: dayMs(coldestRow.date),
            displayValue: cToF(coldestRow.tempMinC),
          }
        : null,
    biggestGust:
      biggestGustRow?.windGustMaxMps != null
        ? {
            tsMs: dayMs(biggestGustRow.date),
            displayValue: mpsToMph(biggestGustRow.windGustMaxMps),
          }
        : null,
    wettest:
      wettestRow?.rainAccumFinalMm != null
        ? {
            tsMs: dayMs(wettestRow.date),
            displayValue: mmToIn(wettestRow.rainAccumFinalMm),
          }
        : null,
    highestUv:
      highestUvRow?.uvMax != null
        ? {
            tsMs: dayMs(highestUvRow.date),
            displayValue: highestUvRow.uvMax,
          }
        : null,
    highestPressure:
      highestPressureRow?.pressureMaxMb != null
        ? {
            tsMs: dayMs(highestPressureRow.date),
            displayValue: mbToInHg(highestPressureRow.pressureMaxMb),
          }
        : null,
  };
}
