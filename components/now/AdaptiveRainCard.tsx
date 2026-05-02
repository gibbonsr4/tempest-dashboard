"use client";

import * as React from "react";
import { Droplets } from "lucide-react";
import { ActiveRateHero } from "@/components/shared/ActiveRateHero";
import { AdaptiveCard } from "@/components/shared/AdaptiveCard";
import { StatTile } from "@/components/shared/StatTile";
import { StormHistogram } from "@/components/shared/StormHistogram";
import { useDailyAggregates } from "@/lib/hooks/useDailyAggregates";
import { useNow } from "@/lib/hooks/useNow";
import { useRecentHistory } from "@/lib/hooks/useRecentHistory";
import { mmToIn } from "@/lib/tempest/conversions";
import { buildStormWindow } from "@/lib/tempest/storm-window";
import { shouldExpandRain } from "@/lib/tempest/interpret";
import {
  computePeriodBoundaries,
  sumSamplesByPeriod,
} from "@/lib/tempest/period-totals";
import { useStationTz } from "@/lib/tempest/tz-context";
import type { StationObs } from "@/lib/tempest/types";

/**
 * Rain summary card.
 *
 * Today / yesterday / last-hour totals come from the station obs
 * directly (`precip_accum_*`). The expanded view also shows a
 * **month-to-date** total computed by summing the proxy's bucketed
 * `rainMm` values back to the first of the current month in the
 * station's tz. We use the existing `useRecentHistory(720)` (the same
 * 30-day window the metric tiles already drive — TanStack dedupes the
 * fetch) which is always enough headroom for any current calendar
 * month: even on the 31st we look back at most 31 days.
 *
 * Year-to-date rain comes from the long-window aggregates endpoint
 * (`useDailyAggregates(365)`), summing Tempest's verified daily
 * totals (`rainAccumFinalMm`) across the calendar year in the
 * station's tz. Hook is shared with the lightning card via TanStack
 * dedupe so a single fetch powers both YTD tiles.
 */
export function AdaptiveRainCard({
  obs,
  open,
  onOpenChange,
}: {
  obs: StationObs;
  /** Optional controlled open state. Pass alongside `onOpenChange` to
   *  couple this card's expand/collapse with a sibling (e.g., the
   *  paired lightning card in the storm panel). Omit both to fall
   *  back to the card's internal auto-expand. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const tz = useStationTz();
  const now = useNow();
  const history = useRecentHistory(24 * 30);

  const dayMm = obs.precip_accum_local_day ?? 0;
  const lastHourMm = obs.precip_accum_last_1hr ?? 0;
  const yesterdayMm = obs.precip_accum_local_yesterday ?? 0;
  const minuteMm = obs.precip ?? 0; // per-minute accumulation

  const dayIn = mmToIn(dayMm);
  const lastHourIn = mmToIn(lastHourMm);
  const yesterdayIn = mmToIn(yesterdayMm);
  // Per-minute accumulation × 60 = approximate current in/hr rate.
  const rateInPerHr = mmToIn(minuteMm) * 60;
  const activeNow = rateInPerHr > 0;

  // Month-to-date sum from the bucketed `rainMm` samples. Year-to-
  // date isn't here because the proxy is hard-capped at 30 days;
  // surfacing year would require either raising the cap (Tempest
  // upstream may not return that much in one call) or a separate
  // aggregate path that pre-rolls daily totals server-side.
  //
  // We use the obs-derived `dayMm` / `yesterdayMm` for "Today" and
  // "Yesterday" tiles since those are the source of truth. The
  // shared period-totals helper drives only the longer windows
  // here, but it keeps the boundary math centralized + DST-safe.
  const monthIn = React.useMemo(() => {
    const totals = sumSamplesByPeriod(
      history.data?.samples,
      computePeriodBoundaries(now, tz),
      (s) => s.rainMm,
    );
    return totals ? mmToIn(totals.month) : null;
  }, [history.data?.samples, now, tz]);

  // Year-to-date rain via the long-window aggregates endpoint.
  // Sums `rainAccumFinalMm` (Tempest's verified daily total — their
  // rain-check feature cross-validates the haptic sensor against
  // nearby radar/network data) across all dates in the current
  // calendar year, station-local. This matches the YTD value
  // shown in the official Tempest mobile app + tempestwx.com web
  // dashboard. Some third-party tools (wfpiconsole) use the raw
  // unverified value instead and may display a slightly different
  // number — that's expected and not a discrepancy on our end.
  // Hook is shared with the lightning card via TanStack dedupe —
  // single fetch powers both YTD tiles.
  const aggregates = useDailyAggregates(365);
  const ytdIn = React.useMemo(() => {
    const rows = aggregates.data?.aggregates;
    if (!rows || rows.length === 0) return null;
    const yearStr = new Date(now).toLocaleDateString("en-CA", {
      timeZone: tz,
      year: "numeric",
    });
    let totalMm = 0;
    let touched = false;
    for (const row of rows) {
      // Date strings from Tempest are station-local. Match by year prefix.
      if (!row.date.startsWith(`${yearStr}-`)) continue;
      const v = row.rainAccumFinalMm;
      if (typeof v === "number" && Number.isFinite(v)) {
        totalMm += v;
        touched = true;
      }
    }
    return touched ? mmToIn(totalMm) : 0;
  }, [aggregates.data?.aggregates, now, tz]);

  const expanded = shouldExpandRain({
    lastHourPrecip: lastHourMm,
    dayTotal: dayMm,
    rateNow: minuteMm,
  });

  // Storm-window histogram of rain over the day's active window.
  // See `buildStormWindow` for the windowing rule (clamps to station-
  // local midnight, floors at `now − 3h`). Skipped entirely on days
  // with no rain (`dayMm <= 0`) so the histogram doesn't render
  // empty bars over a quiet day.
  const histogram = React.useMemo(
    () =>
      dayMm <= 0
        ? null
        : buildStormWindow(history.data?.samples, now, tz, (s) => s.rainMm),
    [history.data?.samples, dayMm, now, tz],
  );

  const Collapsed = (
    <div className="flex items-center gap-3 text-sm">
      <Droplets className="size-4 text-primary" aria-hidden />
      <span className="tabular text-foreground">
        {dayIn.toFixed(2)} in today
      </span>
      <span className="text-muted-foreground tabular">
        · yesterday {yesterdayIn.toFixed(2)} in
      </span>
    </div>
  );

  const Expanded = (
    <div className="space-y-4">
      {/* Live "active rain" hero — shown above the historical tiles
          only while it's actually raining. `precip` (per-minute mm)
          × 60 gives the same kind of high-responsiveness frequency
          datapoint other Tempest dashboards expose: it reacts in
          near-real-time to a sudden burst, where `last_hour` smooths
          over a full 60 minutes. The hero collapses cleanly out of
          the layout when the rate hits zero, so there's no awkward
          empty placeholder during the dry stretches. */}
      {activeNow && (
        <ActiveRateHero
          label="Currently raining"
          value={rateInPerHr.toFixed(2)}
          unit="in/hr"
          subtitle={`Last hour ${lastHourIn.toFixed(2)} in`}
          color="var(--icon-rain)"
        />
      )}
      {/* Storm intensity over the day's active window. Only renders
          when there's actual rain to plot — a flat zero baseline
          would be visual noise, not signal. */}
      {histogram && (
        <div className="text-[var(--icon-rain)]">
          <StormHistogram
            samples={histogram.samples}
            startMs={histogram.startMs}
            endMs={histogram.endMs}
            tz={tz}
            color="currentColor"
            ariaLabel="Rain intensity over the storm window"
          />
        </div>
      )}
      {/* Four historical tiles. Always-on so the card answers "how
          much has it rained" at glance widths from a day to a year
          regardless of whether it's actively raining now. Year-to-
          date pulls from the long-window aggregates endpoint
          (Tempest's obs_st_ext / pre-rolled daily totals) and shows
          "—" while the fetch is in flight. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Today" value={dayIn.toFixed(2)} unit="in" />
        <StatTile
          label="Yesterday"
          value={yesterdayIn.toFixed(2)}
          unit="in"
        />
        <StatTile
          label="This month"
          value={monthIn != null ? monthIn.toFixed(2) : "—"}
          unit={monthIn != null ? "in" : undefined}
        />
        <StatTile
          label="Year to date"
          value={ytdIn != null ? ytdIn.toFixed(2) : "—"}
          unit={ytdIn != null ? "in" : undefined}
        />
      </div>
    </div>
  );

  return (
    <AdaptiveCard
      collapsed={Collapsed}
      expanded={Expanded}
      promoted={expanded}
      defaultExpanded={expanded}
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel="Rain summary, click to toggle detail"
    />
  );
}

// `RainTile` was a local copy of the same "label / value / unit /
// caption" pattern shared with `AdaptiveLightningCard` and
// `HorizonBandCelestial`. Consolidated into `<StatTile>` in
// `components/shared/StatTile.tsx`.

