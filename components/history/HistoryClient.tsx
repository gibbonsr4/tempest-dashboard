"use client";

import * as React from "react";
import { addYears, subYears } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDailyAggregates,
  type DeviceDailyAggregate,
} from "@/lib/hooks/useDailyAggregates";
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
  toCumulative,
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
import {
  buildRanges,
  calendarMonthsBounds,
  type Range,
  RangePicker,
} from "./RangePicker";
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
  const isCalendar = range.kind === "calendar";
  // Both long and calendar pull from the daily-aggregate endpoint —
  // they only differ in how the response is sliced. `useDailyFetch`
  // captures that shared family so the fetch / loading / error wiring
  // doesn't branch three ways.
  const useDailyFetch = isLong || isCalendar;
  const shortQuery = useRecentHistory(isShort ? range.hours : 24, 0, {
    enabled: isShort,
  });

  // Daily-aggregate fetch: serves both long (rolling N days) and
  // calendar (sliced to month boundaries). Bounds:
  //   - LOWER: 181 days, the minimum the daily-aggregate endpoint
  //     accepts (Tempest only returns the obs_st_ext format for
  //     windows ≥181 days). Critical for the 90d range and for
  //     early-year YTD; without this floor the API rejects the
  //     request with a 400.
  //   - UPPER: 730 days (the endpoint max), enough for any of our
  //     90d / YTD / 365d ranges + a full year of comparison data,
  //     and for the 12mo calendar window (which reaches back ~13
  //     months from today depending on day-of-month).
  // For long: when compare is enabled we need ~365 EXTRA days to
  // cover the prior-year overlay window.
  // For calendar: we fetch back from NOW to `range.startMs`, then
  // slice to [startMs, endMs) below — the over-fetch (days between
  // endMs and now, i.e. the in-progress current month) is invisible
  // to the user.
  const longCompareEnabled = isLong && showCompare;
  const dailyFetchDays = isLong
    ? Math.max(
        181,
        Math.min(range.days + (longCompareEnabled ? 365 : 0), 730),
      )
    : isCalendar
      ? Math.max(
          181,
          Math.min(Math.ceil((nowMs - range.startMs) / 86_400_000), 730),
        )
      : 365;
  const longQuery = useDailyAggregates(dailyFetchDays, 0, {
    enabled: useDailyFetch,
  });

  // Calendar compare: a SEPARATE daily-aggregate fetch for the prior
  // 12 complete months (e.g. May 2024 → April 2025 when the current
  // 12mo window is May 2025 → April 2026). Done as its own query —
  // not folded into `longQuery` like long-range compare — because the
  // single-fetch reach (today → start of compare window ≈ 745+ days)
  // exceeds the 730-day per-window cap. The route accepts a `before`
  // offset (mirrors /api/tempest/history) so this second fetch can
  // target the historical window directly.
  const calendarCompareEnabled = isCalendar && showCompare;
  const calendarCompareBounds = React.useMemo(
    () =>
      range.kind === "calendar"
        ? calendarMonthsBounds(tz, range.startMs, range.months)
        : null,
    [range, tz],
  );
  // `before` shifts the fetch's time_end back by N days. We aim
  // time_end at `compareBounds.endMs` (== current range.startMs) so
  // the response covers the prior 12mo window. Math.floor gives a
  // slight over-fetch on the recent side (≤1 day) which the
  // client-side slice trims.
  const calendarCompareBefore =
    calendarCompareBounds && calendarCompareEnabled
      ? Math.max(
          0,
          Math.floor(
            (nowMs - calendarCompareBounds.endMs) / 86_400_000,
          ),
        )
      : 0;
  const calendarCompareQuery = useDailyAggregates(
    // 365 days covers any 12-month calendar window; the per-window
    // cap (730) accommodates this without issue.
    365,
    calendarCompareBefore,
    { enabled: calendarCompareEnabled },
  );

  const isLoading = isShort ? shortQuery.isLoading : longQuery.isLoading;
  const error = isShort ? shortQuery.error : longQuery.error;

  // Short-range samples (sub-daily bucketed from useRecentHistory).
  const samples: HistorySample[] = React.useMemo(
    () => (isShort ? (shortQuery.data?.samples ?? []) : []),
    [isShort, shortQuery.data?.samples],
  );

  // Daily-aggregate rows for long + calendar ranges. The fetch always
  // asks for at least 181 days (endpoint minimum) and at most 730; we
  // slice into "current" and "compare" here so downstream consumers
  // see two clean arrays.
  //   - long: current = most-recent `range.days` rows; compare =
  //     `range.days` rows starting 365 days before today
  //     ("vs same period last year"), sliced from the same fetch.
  //   - calendar: current = rows whose station-local day falls in
  //     [startMs, endMs); compare = rows whose day falls in the
  //     prior 12mo window, sliced from `calendarCompareQuery` (a
  //     SEPARATE fetch — the combined reach exceeds the per-window
  //     730-day cap).
  const { dailyRows, compareDailyRows } = React.useMemo(() => {
    if (range.kind === "short") {
      return { dailyRows: [], compareDailyRows: [] };
    }
    const all = longQuery.data?.aggregates ?? [];
    if (range.kind === "calendar") {
      const { startMs, endMs } = range;
      const inRange = (
        rows: DeviceDailyAggregate[],
        lo: number,
        hi: number,
      ): DeviceDailyAggregate[] =>
        rows.filter((row) => {
          const ms = startOfStationDay(
            new Date(`${row.date}T12:00:00Z`).getTime(),
            tz,
          );
          return ms >= lo && ms < hi;
        });
      const sliced = inRange(all, startMs, endMs);
      let compare: DeviceDailyAggregate[] = [];
      if (
        calendarCompareEnabled &&
        calendarCompareBounds &&
        calendarCompareQuery.data
      ) {
        compare = inRange(
          calendarCompareQuery.data.aggregates,
          calendarCompareBounds.startMs,
          calendarCompareBounds.endMs,
        );
      }
      return { dailyRows: sliced, compareDailyRows: compare };
    }
    // From here range.kind === "long" — `range.days` is safe.
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
  }, [
    longCompareEnabled,
    longQuery.data?.aggregates,
    calendarCompareEnabled,
    calendarCompareBounds,
    calendarCompareQuery.data,
    range,
    tz,
  ]);

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
  // short → aggregateByDay(samples); long + calendar →
  // fromDailyAggregates(rows) (same data shape, dailyRows already
  // sliced to the correct window above).
  const aggregates = React.useMemo(() => {
    if (!useDaily) return null;
    if (useDailyFetch) {
      // Always pass RAW daily aggregates. The DailyAggregateChart
      // component handles smoothing internally via its `smooth` prop
      // (set by the caller below to 7 for long-range), so we don't
      // need to maintain dual-track smoothed + raw arrays here.
      // Header stats inside the chart are computed off the raw data
      // unconditionally so they always reflect the actual annual
      // extremes.
      const rain = fromDailyAggregates(dailyRows, dayPickRain, tz);
      return {
        temp: fromDailyAggregates(dailyRows, dayPickTemp, tz),
        humidity: fromDailyAggregates(dailyRows, dayPickHumidity, tz),
        windAvg: fromDailyAggregates(dailyRows, dayPickWindAvg, tz),
        windGust: fromDailyAggregates(dailyRows, dayPickWindGust, tz),
        pressure: fromDailyAggregates(dailyRows, dayPickPressure, tz),
        rain,
        // Running cumulative rain for the cumulative chart. Same
        // timestamps as `rain` so the two charts share an x-axis.
        // Daily-aggregate variant only — short-range cumulative
        // would need a per-sample scan that doesn't reset across
        // outage minutes and we haven't surfaced a per-sample
        // cumulative chart in the short-range layout.
        rainCumulative: toCumulative(rain),
      };
    }
    // Short-range path — same as before.
    // Rain note: the proxy's `downsample` sums (not averages) `rainMm`
    // per bucket, so each sample's rainIn already represents the bucket
    // total in inches. `aggregateByDay`'s `sum` field then yields the
    // honest daily total — no multiplication tricks needed.
    const rain = aggregateByDay(samples, pickRainIn, tz);
    return {
      temp: aggregateByDay(samples, pickTempF, tz),
      humidity: aggregateByDay(samples, pickHumidity, tz),
      windAvg: aggregateByDay(samples, pickWindMph, tz),
      windGust: aggregateByDay(samples, pickGustMph, tz),
      pressure: aggregateByDay(samples, pickPressureInHg, tz),
      rain,
      rainCumulative: toCumulative(rain),
    };
  }, [useDaily, useDailyFetch, dailyRows, samples, tz]);

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
  // Long / calendar shift: 1 calendar year (so last year's same-period
  // overlays with this year — works for both rolling 365d and
  // calendar-aligned 12mo since both compare against the same window
  // shifted exactly 12 months back).
  const compareAggregates = React.useMemo(() => {
    if (!useDaily) return null;
    if (useDailyFetch && compareDailyRows.length > 0) {
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
      const compareRain = fromDailyAggregates(
        compareDailyRows,
        dayPickRain,
        tz,
      );
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
        rain: shift(compareRain),
        // Compare cumulative — accumulate the prior-year rain in
        // chronological order FIRST, then shift forward 1 year so
        // the line overlays cleanly on the current period's x-axis.
        // (Order doesn't actually matter since the shift only touches
        // `ts`, not the values, but accumulating-then-shifting reads
        // more naturally.)
        rainCumulative: shift(toCumulative(compareRain)),
      };
    }
    if (isShort && compareSamples.length > 0) {
      const shiftMs = range.hours * 60 * 60 * 1000;
      const shift = (arr: DailyAggregate[]): DailyAggregate[] =>
        arr.map((d) => ({ ...d, ts: startOfStationDay(d.ts + shiftMs, tz) }));
      const compareRain = aggregateByDay(compareSamples, pickRainIn, tz);
      return {
        temp: shift(aggregateByDay(compareSamples, pickTempF, tz)),
        humidity: shift(aggregateByDay(compareSamples, pickHumidity, tz)),
        windAvg: shift(aggregateByDay(compareSamples, pickWindMph, tz)),
        windGust: shift(aggregateByDay(compareSamples, pickGustMph, tz)),
        pressure: shift(aggregateByDay(compareSamples, pickPressureInHg, tz)),
        rain: shift(compareRain),
        // Carried through for type-shape parity with the long-range
        // branch; short-range layout doesn't currently render the
        // cumulative chart, so this field goes unused in practice.
        rainCumulative: shift(toCumulative(compareRain)),
      };
    }
    return null;
  }, [
    useDaily,
    useDailyFetch,
    isShort,
    compareDailyRows,
    compareSamples,
    range,
    tz,
  ]);

  // WindRose + PersonalRecords now consume their range family's
  // native shape directly (samples for short, daily aggregates for
  // long + calendar) — no more synthetic-sample adapter. See the
  // discriminated union props on each component for the two code paths.
  const hasBottomData = useDailyFetch
    ? dailyRows.length > 0
    : samples.length > 0;

  // Used by MetricChart (24h rendering) and PersonalRecords (title).
  // PersonalRecords switches its title between "Today's peaks" /
  // "Week peaks" / "Month peaks" / "Year peaks" based on this value.
  // Calendar derives its day-span from `endMs - startMs` so the title
  // logic stays consistent with long-range "365d ≈ 1 year" framing.
  const displayDays =
    range.kind === "long"
      ? range.days
      : range.kind === "calendar"
        ? Math.round((range.endMs - range.startMs) / 86_400_000)
        : 0;
  const hours = isShort ? range.hours : displayDays * 24;

  // Span label shown in the top-right of the WindRose and
  // PersonalRecords cards (e.g. "12 months", "365 days", "24 hours").
  // Mirrors the range picker's user-facing semantic — calendar ranges
  // read in months even when they happen to cover ~365 days, so 12mo
  // says "12 months" rather than "365 days" which would frame the
  // window as a rolling day-count and misalign with the calendar
  // subtitle ("May 2025 – Apr 2026") above.
  const spanLabel = (() => {
    if (range.kind === "calendar") {
      return `${range.months} months`;
    }
    if (range.kind === "short") {
      return range.hours <= 24
        ? `${Math.round(range.hours)} hours`
        : `${Math.round(range.hours / 24)} days`;
    }
    return `${range.days} days`;
  })();

  // Whether the Compare toggle is even applicable for the current
  // range. Short-range 24h doesn't make sense to compare (yesterday's
  // diurnal cycle just sits on top); long + calendar both support
  // "vs same period last year." Single source of truth used by both
  // the toggle's render gate AND the description label.
  const canCompare = (isShort && range.hours > 24) || useDailyFetch;
  const compareLabel = useDailyFetch
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
        <div>
          <h1 className="text-lg font-medium tracking-tight">History</h1>
          {/* Date-range caption — the actual window the page is
              showing. Format adapts to range family:
                - calendar (12mo): "May 2025 – Apr 2026"
                - long (90d/YTD/365d): "May 19, 2025 – May 18, 2026"
                - short (24h): "May 17 7:23 PM – May 18 7:23 PM"
                - short (7d/30d): "Apr 18 – May 18, 2026"
              The caption is computed off `nowMs` (60s tick from
              useNow) so it stays current as the tab ages — same
              cadence that keeps the YTD count accurate. */}
          <div
            className="text-xs text-muted-foreground tabular-nums"
            aria-live="polite"
          >
            {formatRangeWindow(range, nowMs, tz)}
          </div>
        </div>
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
                smooth={useDailyFetch ? 7 : 0}
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
                smooth={useDailyFetch ? 7 : 0}
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
                smooth={useDailyFetch ? 7 : 0}
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
                smooth={useDailyFetch ? 7 : 0}
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
                smooth={useDailyFetch ? 7 : 0}
                label="Pressure (daily avg)"
                unit="inHg"
                color="var(--chart-4)"
                variant="mean"
                formatValue={(v) => v.toFixed(2)}
              />
            </ExpandableChart>
            <ExpandableChart>
              {/* Cumulative rain sits in slot 6 next to Pressure so
                  the year-over-year "are we ahead or behind on
                  rainfall?" question has dedicated real estate, and
                  the daily-total bars get pushed to the full-width
                  row below where their narrow bars have room to
                  breathe at long ranges. */}
              <DailyAggregateChart
                data={aggregates.rainCumulative}
                compare={compareAggregates?.rainCumulative}
                smooth={useDailyFetch ? 7 : 0}
                label="Rain (cumulative)"
                unit="in"
                color="var(--chart-2)"
                variant="cumulative"
                formatValue={(v) => v.toFixed(2)}
              />
            </ExpandableChart>
            {/* Daily rain spans the full grid width (lg:col-span-2)
                so the per-day bars get the full row to themselves —
                roughly 2× the bar width vs sharing a row with another
                chart. Combined with the cumulative chart above, this
                gives rain two complementary readings: cumulative for
                "are we trending wet or dry?" and daily for "which
                days had storms?". The wrapping div carries the
                col-span class so ExpandableChart's signature stays
                unchanged. */}
            <div className="lg:col-span-2">
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
                  smooth={useDailyFetch ? 7 : 0}
                  label="Rain (daily total)"
                  unit="in"
                  color="var(--chart-2)"
                  variant="sum"
                  formatValue={(v) => v.toFixed(2)}
                />
              </ExpandableChart>
            </div>
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
          {useDailyFetch ? (
            <>
              <WindRose
                kind="daily"
                rows={dailyRows}
                compareRows={
                  compareDailyRows.length > 0 ? compareDailyRows : undefined
                }
                spanLabel={spanLabel}
              />
              <PersonalRecords
                kind="daily"
                rows={dailyRows}
                compareRows={
                  compareDailyRows.length > 0 ? compareDailyRows : undefined
                }
                days={displayDays}
                spanLabel={spanLabel}
              />
            </>
          ) : (
            <>
              <WindRose kind="samples" samples={samples} />
              <PersonalRecords
                kind="samples"
                samples={samples}
                compareSamples={
                  compareSamples.length > 0 ? compareSamples : undefined
                }
                hours={range.kind === "short" ? range.hours : 24}
                spanLabel={spanLabel}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Format the visible data window as a human-readable date range
 * caption shown under the "History" title. Adapts to range family:
 *
 *   - calendar (12mo): "May 2025 – Apr 2026" (month + year on each
 *     end; the range covers complete calendar months only).
 *   - long (90d / YTD / 365d): "May 19, 2025 – May 18, 2026" (rolling
 *     window through now; year is always shown since these often
 *     straddle a year boundary).
 *   - short 24h: "May 17, 7:23 PM – May 18, 7:23 PM" (clock precision
 *     since the window is sub-daily).
 *   - short 7d / 30d: "Apr 18 – May 18, 2026" (day-precision; year
 *     shown once since these never straddle a year here).
 *
 * Computed off the live `nowMs` (60s tick) so the caption ages with
 * the tab, matching the rest of the range-derived UI.
 */
function formatRangeWindow(range: Range, nowMs: number, tz: string): string {
  if (range.kind === "calendar") {
    const start = formatInTimeZone(new Date(range.startMs), tz, "MMM yyyy");
    // `endMs` is exclusive (first ms of the current month). Stepping
    // back one day lands inside the last complete month — that's what
    // we want to label as the right-hand bound.
    const lastCompleteMonthMs = range.endMs - 86_400_000;
    const end = formatInTimeZone(
      new Date(lastCompleteMonthMs),
      tz,
      "MMM yyyy",
    );
    return `${start} – ${end}`;
  }
  if (range.kind === "short" && range.hours <= 24) {
    const startMs = nowMs - range.hours * 3_600_000;
    return `${formatInTimeZone(
      new Date(startMs),
      tz,
      "MMM d, h:mm a",
    )} – ${formatInTimeZone(new Date(nowMs), tz, "MMM d, h:mm a")}`;
  }
  // long, or short ≥ 7d — both are day-precision day-or-month windows.
  const spanMs =
    range.kind === "short" ? range.hours * 3_600_000 : range.days * 86_400_000;
  const startMs = nowMs - spanMs;
  return `${formatInTimeZone(
    new Date(startMs),
    tz,
    "MMM d, yyyy",
  )} – ${formatInTimeZone(new Date(nowMs), tz, "MMM d, yyyy")}`;
}
