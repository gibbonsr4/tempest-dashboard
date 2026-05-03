"use client";

import * as React from "react";
import { addYears, subYears } from "date-fns";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDailyAggregates } from "@/lib/hooks/useDailyAggregates";
import { useNow } from "@/lib/hooks/useNow";
import {
  useRecentHistory,
  type HistorySample,
} from "@/lib/hooks/useRecentHistory";
import { useStationTz } from "@/lib/tempest/tz-context";
import { startOfStationDay } from "@/lib/tempest/format";
import {
  aggregateByDay,
  fromDailyAggregates,
  type DailyAggregate,
} from "./aggregate";
import { DailyAggregateChart } from "./DailyAggregateChart";
import { ExpandableChart } from "./ExpandableChart";
import {
  dayPickHumidity,
  dayPickPressure,
  dayPickRain,
  dayPickTemp,
  dayPickWindAvg,
  dayPickWindGust,
  pickGustMph,
  pickHumidity,
  pickPressureInHg,
  pickRainIn,
  pickTempF,
  pickWindMph,
} from "./historyClientPickers";
import { MetricChart } from "./MetricChart";
import { PersonalRecords } from "./PersonalRecords";
import { buildRanges, type Range, RangePicker } from "./RangePicker";
import { WindRose } from "./WindRose";

// Sample + daily-aggregate pickers live in
// `./historyClientPickers.ts` — they're pure data-shape adapters
// that don't need to share scope with the layout component.

// Default to 24h. Doesn't depend on tz so safe at module load.
const DEFAULT_RANGE: Range = { kind: "short", label: "24h", hours: 24 };

/**
 * History tab. Two range families behave differently:
 *
 *   - **short** (24h / 7d / 30d): high-res sub-daily observations
 *     from `useRecentHistory(hours)`. At 24h we render raw bucketed
 *     line charts (the diurnal cycle is the signal). At 7d / 30d
 *     we client-side aggregate to daily values (high/low band +
 *     mean line) since the diurnal cycle becomes noise.
 *
 *   - **long** (90d / YTD / 1y): pre-rolled daily aggregates from
 *     Tempest's `obs_st_ext` format via `useDailyAggregates(days)`.
 *     Same `DailyAggregate` shape (via the `fromDailyAggregates`
 *     adapter) so chart components are shared.
 *
 * Compare overlay logic differs by family:
 *   - short: fetches the prior equivalent window (7d ago vs now) via
 *     `useRecentHistory(hours, before=hours)` and shifts timestamps
 *     forward to overlap on the x-axis
 *   - long: fetches an extended daily-aggregate window (`min(days +
 *     365, 730)`) and shifts the prior 365-day slice forward via
 *     `addYears` + `startOfStationDay` so a "vs same period last
 *     year" overlay aligns calendar dates correctly across DST and
 *     leap years
 */
export function HistoryClient() {
  const [range, setRange] = React.useState<Range>(DEFAULT_RANGE);
  const [showCompare, setShowCompare] = React.useState(false);
  const tz = useStationTz();
  // useNow drives both the range list (so YTD stays current as the
  // tab ages past local midnight) and downstream consumers. The
  // 60s tick is fine — YTD's day count flips at most once per day.
  const nowMs = useNow(60_000);
  const ranges = React.useMemo(() => buildRanges(tz, nowMs), [tz, nowMs]);

  // Short-range path: useRecentHistory + client-side aggregation.
  // We always invoke both hooks so React doesn't see a different
  // hook count between renders — the disabled one returns nothing.
  const isShort = range.kind === "short";
  const isLong = range.kind === "long";
  const shortQuery = useRecentHistory(isShort ? range.hours : 24, 0, {
    enabled: isShort,
  });

  // Long-range fetch: when compare is enabled we need ~365 EXTRA days
  // to cover the prior-year window. Bounds:
  //   - LOWER: 181 days, the minimum the daily-aggregate endpoint
  //     accepts (Tempest only returns the obs_st_ext format for
  //     windows ≥181 days). Critical for the 90d range and for
  //     early-year YTD; without this floor the API rejects the
  //     request with a 400.
  //   - UPPER: 730 days (the endpoint max), enough for any of our
  //     90d / YTD / 1y ranges + a full year of comparison data.
  // We always slice the response back down to `range.days` for
  // display (see `dailyRows` below), so over-requesting at the
  // small end is invisible to the user.
  const longCompareEnabled = isLong && showCompare;
  const longFetchDays = isLong
    ? Math.max(
        181,
        Math.min(range.days + (longCompareEnabled ? 365 : 0), 730),
      )
    : 365;
  const longQuery = useDailyAggregates(longFetchDays, {
    enabled: isLong,
  });

  const isLoading = isShort ? shortQuery.isLoading : longQuery.isLoading;
  const error = isShort ? shortQuery.error : longQuery.error;

  // Short-range samples (sub-daily bucketed from useRecentHistory).
  const samples: HistorySample[] = React.useMemo(
    () => (isShort ? (shortQuery.data?.samples ?? []) : []),
    [isShort, shortQuery.data?.samples],
  );

  // Long-range daily-aggregate rows. The fetch always asks for at
  // least 181 days (endpoint minimum) and at most 730; we slice
  // into "current" (most-recent range.days rows) and "compare"
  // (range.days rows starting 365 days before today) here so
  // downstream consumers see two clean arrays.
  const { dailyRows, compareDailyRows } = React.useMemo(() => {
    if (!isLong) return { dailyRows: [], compareDailyRows: [] };
    const all = longQuery.data?.aggregates ?? [];
    // Slice the response down to the user-facing `range.days`. For
    // 90d and early-year YTD this drops the over-fetched padding
    // that was needed to satisfy the 181-day API minimum. Without
    // this slice, the 90d chart would silently render 181 days of
    // data, and early-year YTD would over-report by including
    // late-prior-year days.
    const current = all.slice(-range.days);
    if (!longCompareEnabled) {
      return { dailyRows: current, compareDailyRows: [] };
    }
    if (current.length === 0) return { dailyRows: [], compareDailyRows: [] };
    // Tempest returns rows oldest-first. The current period is the
    // most recent `range.days` entries. The compare period is the
    // `range.days` entries that END exactly 365 days before the
    // current period's start — identified by date string filter for
    // robustness against gap days in the response.
    const currentStartDate = current[0].date;
    // Anchor the current period's start at station-local midnight,
    // then derive the compare period as "exactly 1 calendar year
    // earlier" using `subYears` rather than raw ms math. The naive
    // `365 * 86_400_000` shift drifts by one date around leap day
    // (Mar 1 2025 → Mar 2 2024 because 2024 had Feb 29). `subYears`
    // does proper calendar arithmetic; we then snap through
    // `startOfStationDay` for tz/DST safety.
    const currentStartMs = startOfStationDay(
      new Date(`${currentStartDate}T12:00:00Z`).getTime(),
      tz,
    );
    const compareStartMs = startOfStationDay(
      subYears(new Date(currentStartMs), 1).getTime(),
      tz,
    );
    const compareEndMs = compareStartMs + range.days * 86_400_000;
    const compare = all.filter((row) => {
      const ms = startOfStationDay(
        new Date(`${row.date}T12:00:00Z`).getTime(),
        tz,
      );
      return ms >= compareStartMs && ms < compareEndMs;
    });
    return { dailyRows: current, compareDailyRows: compare };
  }, [isLong, longCompareEnabled, longQuery.data?.aggregates, range, tz]);

  // At 24h we keep raw line charts. Anywhere ≥7d we use the
  // daily-aggregate variant — short-range aggregates client-side,
  // long-range comes pre-aggregated from Tempest.
  const useDaily = !isShort || range.hours > 24;

  // Compare overlay logic differs by family:
  //   - short-range >24h: "vs previous period" (e.g. last 30d vs the
  //     30d before that). Fetched separately via useRecentHistory.
  //   - long-range: "vs same period last year" (handled above by
  //     slicing the longer-window fetch).
  const shortCompareEnabled = showCompare && isShort && range.hours > 24;
  const compareQuery = useRecentHistory(
    isShort ? range.hours : 24,
    isShort ? range.hours : 0,
    { enabled: shortCompareEnabled },
  );
  const compareSamples = React.useMemo<HistorySample[]>(
    () => (shortCompareEnabled ? (compareQuery.data?.samples ?? []) : []),
    [shortCompareEnabled, compareQuery.data?.samples],
  );

  // Pre-compute the per-metric daily aggregates once so each chart
  // doesn't pay the O(n) pass independently. The station's tz is
  // passed in so day boundaries anchor at station-local midnight,
  // not the browser's midnight. Source differs by range family:
  // short → aggregateByDay(samples), long → fromDailyAggregates(rows).
  const aggregates = React.useMemo(() => {
    if (!useDaily) return null;
    if (isLong) {
      // Always pass RAW daily aggregates. The DailyAggregateChart
      // component handles smoothing internally via its `smooth` prop
      // (set by the caller below to 7 for long-range), so we don't
      // need to maintain dual-track smoothed + raw arrays here.
      // Header stats inside the chart are computed off the raw data
      // unconditionally so they always reflect the actual annual
      // extremes.
      return {
        temp: fromDailyAggregates(dailyRows, dayPickTemp, tz),
        humidity: fromDailyAggregates(dailyRows, dayPickHumidity, tz),
        windAvg: fromDailyAggregates(dailyRows, dayPickWindAvg, tz),
        windGust: fromDailyAggregates(dailyRows, dayPickWindGust, tz),
        pressure: fromDailyAggregates(dailyRows, dayPickPressure, tz),
        rain: fromDailyAggregates(dailyRows, dayPickRain, tz),
      };
    }
    // Short-range path — same as before.
    // Rain note: the proxy's `downsample` sums (not averages) `rainMm`
    // per bucket, so each sample's rainIn already represents the bucket
    // total in inches. `aggregateByDay`'s `sum` field then yields the
    // honest daily total — no multiplication tricks needed.
    return {
      temp: aggregateByDay(samples, pickTempF, tz),
      humidity: aggregateByDay(samples, pickHumidity, tz),
      windAvg: aggregateByDay(samples, pickWindMph, tz),
      windGust: aggregateByDay(samples, pickGustMph, tz),
      pressure: aggregateByDay(samples, pickPressureInHg, tz),
      rain: aggregateByDay(samples, pickRainIn, tz),
    };
  }, [useDaily, isLong, dailyRows, samples, tz]);

  // Compare aggregates: timestamps shifted forward to overlap on
  // the current period's x-axis. We re-anchor each shifted point
  // through `startOfStationDay` rather than trusting a raw ms
  // offset: in DST-observing zones, a multi-day shift across the
  // spring/fall transition lands on `01:00` or `23:00` local rather
  // than midnight, so the dashed overlay would drift off the
  // current-period day slots without the snap-back.
  //
  // Short shift: `range.hours` (so last 7d shifts forward to overlay
  // with the current 7d).
  // Long shift: 365 days (so last year's same-period overlays with
  // this year).
  const compareAggregates = React.useMemo(() => {
    if (!useDaily) return null;
    if (isLong && compareDailyRows.length > 0) {
      // Shift each compare-period row's `ts` forward by exactly
      // ONE CALENDAR YEAR using `addYears`, NOT raw ms math.
      // `startOfStationDay` re-anchors to local midnight so DST
      // transitions don't leave shifted points at 01:00 / 23:00.
      //
      // No smoothing here — the DailyAggregateChart applies the
      // same `smooth` window to both `data` and `compare` internally,
      // so smoothed-vs-smoothed comparison stays apples-to-apples
      // without parent-side coordination.
      const shift = (arr: DailyAggregate[]): DailyAggregate[] =>
        arr.map((d) => ({
          ...d,
          ts: startOfStationDay(addYears(new Date(d.ts), 1).getTime(), tz),
        }));
      return {
        temp: shift(fromDailyAggregates(compareDailyRows, dayPickTemp, tz)),
        humidity: shift(
          fromDailyAggregates(compareDailyRows, dayPickHumidity, tz),
        ),
        windAvg: shift(
          fromDailyAggregates(compareDailyRows, dayPickWindAvg, tz),
        ),
        windGust: shift(
          fromDailyAggregates(compareDailyRows, dayPickWindGust, tz),
        ),
        pressure: shift(
          fromDailyAggregates(compareDailyRows, dayPickPressure, tz),
        ),
        rain: shift(fromDailyAggregates(compareDailyRows, dayPickRain, tz)),
      };
    }
    if (isShort && compareSamples.length > 0) {
      const shiftMs = range.hours * 60 * 60 * 1000;
      const shift = (arr: DailyAggregate[]): DailyAggregate[] =>
        arr.map((d) => ({ ...d, ts: startOfStationDay(d.ts + shiftMs, tz) }));
      return {
        temp: shift(aggregateByDay(compareSamples, pickTempF, tz)),
        humidity: shift(aggregateByDay(compareSamples, pickHumidity, tz)),
        windAvg: shift(aggregateByDay(compareSamples, pickWindMph, tz)),
        windGust: shift(aggregateByDay(compareSamples, pickGustMph, tz)),
        pressure: shift(aggregateByDay(compareSamples, pickPressureInHg, tz)),
        rain: shift(aggregateByDay(compareSamples, pickRainIn, tz)),
      };
    }
    return null;
  }, [
    useDaily,
    isLong,
    isShort,
    compareDailyRows,
    compareSamples,
    range,
    tz,
  ]);

  // WindRose + PersonalRecords now consume their range family's
  // native shape directly (samples for short, daily aggregates for
  // long) — no more synthetic-sample adapter. See the discriminated
  // union props on each component for the two code paths.
  const hasBottomData = isLong ? dailyRows.length > 0 : samples.length > 0;

  // Used by MetricChart (24h rendering) and PersonalRecords (title).
  // PersonalRecords switches its title between "Today's peaks" /
  // "Week peaks" / "Month peaks" / "Year peaks" based on this value.
  const hours = isShort ? range.hours : range.days * 24;

  // Whether the Compare toggle is even applicable for the current
  // range. Short-range 24h doesn't make sense to compare (yesterday's
  // diurnal cycle just sits on top); single source of truth used by
  // both the toggle's render gate AND the description label.
  const canCompare = (isShort && range.hours > 24) || isLong;
  const compareLabel = isLong
    ? "Compare to last year"
    : "Compare to previous period";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
      {/* Top bar layout:
          - **Mobile**: title row, then range picker (right-aligned),
            then compare toggle (right-aligned, on its own row). The
            picker is the primary control so it gets visual priority;
            compare drops below where the long "Compare to previous
            period" label has room to render on a single line without
            crowding the picker.
          - **Desktop (sm+)**: title on the left, [compare + picker]
            on the right (compare uses `sm:order-first` to sit before
            the picker — matches the prior desktop layout). */}
      <div className="space-y-2 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:space-y-0">
        <h1 className="text-lg font-medium tracking-tight">History</h1>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
          <RangePicker ranges={ranges} value={range} onChange={setRange} />
          {canCompare && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground sm:order-first">
              <input
                type="checkbox"
                className="size-3.5 cursor-pointer accent-primary"
                checked={showCompare}
                onChange={(e) => setShowCompare(e.target.checked)}
              />
              <span>{compareLabel}</span>
            </label>
          )}
        </div>
      </div>

      {error && (
        <Card className="p-4 text-sm text-muted-foreground">
          Couldn&apos;t load history: {String(error.message ?? error)}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {isLoading && samples.length === 0 && dailyRows.length === 0 ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))}
          </>
        ) : useDaily && aggregates ? (
          <>
            <ExpandableChart>
              <DailyAggregateChart
                data={aggregates.temp}
                compare={compareAggregates?.temp}
                smooth={isLong ? 7 : 0}
                label="Temperature"
                unit="°F"
                color="var(--chart-1)"
                variant="range"
                formatValue={(v) => `${Math.round(v)}`}
              />
            </ExpandableChart>
            <ExpandableChart>
              <DailyAggregateChart
                data={aggregates.humidity}
                compare={compareAggregates?.humidity}
                smooth={isLong ? 7 : 0}
                label="Humidity"
                unit="%"
                color="var(--chart-2)"
                variant="range"
                formatValue={(v) => `${Math.round(v)}`}
                yDomain={[0, 100]}
              />
            </ExpandableChart>
            <ExpandableChart>
              <DailyAggregateChart
                data={aggregates.windAvg}
                compare={compareAggregates?.windAvg}
                smooth={isLong ? 7 : 0}
                label="Wind (daily avg)"
                unit="mph"
                color="var(--chart-3)"
                variant="mean"
                formatValue={(v) => v.toFixed(1)}
              />
            </ExpandableChart>
            <ExpandableChart>
              <DailyAggregateChart
                data={aggregates.windGust}
                compare={compareAggregates?.windGust}
                smooth={isLong ? 7 : 0}
                label="Wind (daily peak gust)"
                unit="mph"
                color="var(--chart-3)"
                variant="max"
                formatValue={(v) => v.toFixed(1)}
              />
            </ExpandableChart>
            <ExpandableChart>
              <DailyAggregateChart
                data={aggregates.pressure}
                compare={compareAggregates?.pressure}
                smooth={isLong ? 7 : 0}
                label="Pressure (daily avg)"
                unit="inHg"
                color="var(--chart-4)"
                variant="mean"
                formatValue={(v) => v.toFixed(2)}
              />
            </ExpandableChart>
            <ExpandableChart>
              <DailyAggregateChart
                data={aggregates.rain}
                compare={compareAggregates?.rain}
                // sum-variant ignores smooth internally (averaging
                // a sum destroys the burst signal), but the chart
                // uses this prop as a "are we at long range?"
                // signal to render an invisible placeholder under
                // the label, keeping the rain card's header height
                // matched with its smoothed siblings in the row.
                smooth={isLong ? 7 : 0}
                label="Rain (daily total)"
                unit="in"
                color="var(--chart-2)"
                variant="sum"
                formatValue={(v) => v.toFixed(2)}
              />
            </ExpandableChart>
          </>
        ) : (
          <>
            <ExpandableChart>
              <MetricChart
                data={samples}
                pick={pickTempF}
                label="Temperature"
                unit="°F"
                color="var(--chart-1)"
                kind="area"
                hours={hours}
                formatValue={(v) => `${Math.round(v)}`}
              />
            </ExpandableChart>
            <ExpandableChart>
              <MetricChart
                data={samples}
                pick={pickHumidity}
                label="Humidity"
                unit="%"
                color="var(--chart-2)"
                hours={hours}
                formatValue={(v) => `${Math.round(v)}`}
                yDomain={[0, 100]}
              />
            </ExpandableChart>
            <ExpandableChart>
              <MetricChart
                data={samples}
                pick={pickWindMph}
                label="Wind (avg)"
                unit="mph"
                color="var(--chart-3)"
                hours={hours}
                formatValue={(v) => v.toFixed(1)}
              />
            </ExpandableChart>
            <ExpandableChart>
              <MetricChart
                data={samples}
                pick={pickGustMph}
                label="Wind (gust)"
                unit="mph"
                color="var(--chart-3)"
                hours={hours}
                formatValue={(v) => v.toFixed(1)}
              />
            </ExpandableChart>
            <ExpandableChart>
              <MetricChart
                data={samples}
                pick={pickPressureInHg}
                label="Pressure"
                unit="inHg"
                color="var(--chart-4)"
                hours={hours}
                formatValue={(v) => v.toFixed(2)}
              />
            </ExpandableChart>
            <ExpandableChart>
              <MetricChart
                data={samples}
                pick={pickRainIn}
                label="Rain (per bucket)"
                unit="in"
                color="var(--chart-2)"
                kind="bar"
                hours={hours}
                formatValue={(v) => v.toFixed(2)}
              />
            </ExpandableChart>
          </>
        )}
      </div>

      {/* WindRose + PersonalRecords accept either short-range
          samples or long-range daily aggregates via a discriminated
          `kind` prop. No more synthetic-sample adapter — each
          component does its own walk over its native shape, which
          gives accurate Coldest (= min of `tempMinC` daily) and an
          honest WindRose vote count (1/day instead of 2/day). */}
      {hasBottomData && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {isLong ? (
            <>
              <WindRose kind="daily" rows={dailyRows} />
              <PersonalRecords
                kind="daily"
                rows={dailyRows}
                days={range.kind === "long" ? range.days : 0}
              />
            </>
          ) : (
            <>
              <WindRose kind="samples" samples={samples} />
              <PersonalRecords
                kind="samples"
                samples={samples}
                hours={range.kind === "short" ? range.hours : 24}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
