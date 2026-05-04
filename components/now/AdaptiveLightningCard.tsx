"use client";

import * as React from "react";
import { Zap } from "lucide-react";
import { ActiveRateHero } from "@/components/shared/ActiveRateHero";
import { AdaptiveCard } from "@/components/shared/AdaptiveCard";
import { StatTile } from "@/components/shared/StatTile";
import { StormHistogram } from "@/components/shared/StormHistogram";
import { useDailyAggregates } from "@/lib/hooks/useDailyAggregates";
import { useNow } from "@/lib/hooks/useNow";
import { useRecentHistory } from "@/lib/hooks/useRecentHistory";
import { kmToMi } from "@/lib/tempest/conversions";
import { formatRelative } from "@/lib/tempest/format";
import { buildStormWindow } from "@/lib/tempest/storm-window";
import { shouldPromoteLightning } from "@/lib/tempest/interpret";
import {
  computePeriodBoundaries,
  sumSamplesByPeriod,
} from "@/lib/tempest/period-totals";
import { useStationTz } from "@/lib/tempest/tz-context";
import type { StationObs } from "@/lib/tempest/types";

/**
 * Lightning summary card. Quiet single-line state when no last-strike
 * data has ever been reported; otherwise shows the most recent strike
 * (distance + age) — even if it was weeks ago.
 *
 * Active-strike accent: when the most recent strike is both recent
 * (< 30 min) and close (< 10 mi) — see `shouldPromoteLightning` — the
 * Zap icon tints copper to flag the event at a glance. The card's
 * open state is owned by NowClient's coupled storm-panel logic.
 *
 * Expanded view surfaces:
 *   - last strike (mi + age)
 *   - "Storm in progress" hero with `count_last_1hr` rendered as
 *     `strikes/hr` while a storm is firing
 *   - **today / yesterday / month totals** — derived by summing bucketed
 *     `lightningStrikeCount` from `useRecentHistory` against station-tz
 *     period boundaries (Tempest's obs payload doesn't expose per-day
 *     counts directly)
 *   - **year-to-date total** — sourced from the long-window aggregates
 *     endpoint (`obs_st_ext` daily counts), shared with the rain card
 *     via TanStack dedupe
 *
 * The previous docstring claimed a `count_1hr / 60 strikes/min`
 * "frequency" tile — that calculation no longer exists; the hero
 * shows the raw 1-hr count.
 */
export function AdaptiveLightningCard({
  obs,
  open,
  onOpenChange,
  bucketMs,
}: {
  obs: StationObs;
  /** Controlled open state. Paired with `onOpenChange` to couple this
   *  card's expand/collapse with the rain card in the storm panel. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Histogram bucket width (ms). Computed once at the storm-panel
   *  level so rain + lightning charts share an x-axis. */
  bucketMs: number;
}) {
  const now = useNow();
  const tz = useStationTz();
  // Two history windows. The 24h query carries the today-resolution
  // samples (~10-min cadence) the storm histogram needs to render
  // densely. The 30d query feeds the today / yesterday / month
  // totals via `sumSamplesByPeriod`, where 5-h-bucket cadence is fine
  // since we only sum. TanStack dedupes both with the rain card and
  // NowClient.
  const stormHistory = useRecentHistory(24);
  const monthHistory = useRecentHistory(24 * 30);

  const lastEpoch = obs.lightning_strike_last_epoch ?? null;
  const lastDistKm = obs.lightning_strike_last_distance ?? null;
  const count1hr = obs.lightning_strike_count_last_1hr ?? 0;

  // Tempest reports 0 for both `lightning_strike_last_epoch` and
  // `lightning_strike_last_distance` to mean "no strike on record" —
  // coerce both to null. The AS3935 sensor inside the Tempest can't
  // physically report distance < ~5 km on its real bins, so 0 is a
  // sentinel rather than "extremely close." Verified by sensor
  // datasheet behavior; not currently re-verifiable against Tempest's
  // (gated) API docs, so this convention is documented here in case
  // it ever needs to be revisited.
  const recentEpochMs = lastEpoch && lastEpoch > 0 ? lastEpoch * 1000 : null;
  const recentDistMi =
    lastDistKm != null && lastDistKm > 0 ? kmToMi(lastDistKm) : null;

  const activeStrikeAccent = shouldPromoteLightning({
    lastStrikeEpochMs: recentEpochMs,
    lastStrikeMi: recentDistMi,
    now,
  });

  const hasRecord = recentEpochMs != null && recentDistMi != null;

  // Historical strike counts via the shared period-totals helper —
  // DST-safe boundary arithmetic and a single-pass reduction over
  // the bucketed (≤30-day) history payload. The year-to-date count
  // can't come from this path (the proxy caps at 30 days) and is
  // sourced separately below from the long-window aggregates
  // endpoint (`obs_st_ext` daily counts).
  const totals = React.useMemo(
    () =>
      sumSamplesByPeriod(
        monthHistory.data?.samples,
        computePeriodBoundaries(now, tz),
        (s) => s.lightningStrikeCount,
      ) ?? { today: null, yesterday: null, month: null },
    [monthHistory.data?.samples, now, tz],
  );

  // Year-to-date strike count via the long-window aggregates
  // endpoint (Tempest's pre-rolled daily totals via obs_st_ext).
  // Hook is shared with the rain card via TanStack dedupe — single
  // fetch powers both YTD tiles.
  const aggregates = useDailyAggregates(365);
  const ytdStrikes = React.useMemo(() => {
    const rows = aggregates.data?.aggregates;
    if (!rows || rows.length === 0) return null;
    const yearStr = new Date(now).toLocaleDateString("en-CA", {
      timeZone: tz,
      year: "numeric",
    });
    let total = 0;
    let touched = false;
    for (const row of rows) {
      // Date strings from Tempest are station-local. Match by year prefix.
      if (!row.date.startsWith(`${yearStr}-`)) continue;
      const v = row.lightningStrikeCount;
      if (typeof v === "number" && Number.isFinite(v)) {
        total += v;
        touched = true;
      }
    }
    return touched ? total : 0;
  }, [aggregates.data?.aggregates, now, tz]);

  // Storm-window histogram of strike count over the day's active
  // window. See `buildStormWindow` for the windowing rule (clamps
  // to station-local midnight, floors at now − 3h so brief storms
  // don't collapse to a single bar at the right edge).
  const histogram = React.useMemo(
    () =>
      buildStormWindow(
        stormHistory.data?.samples,
        now,
        tz,
        (s) => s.lightningStrikeCount,
      ),
    [stormHistory.data?.samples, now, tz],
  );

  const activeNow = count1hr > 0;

  const Collapsed = (
    <div className="flex items-center gap-3 text-sm">
      <Zap
        className="size-4"
        style={{
          color: activeStrikeAccent
            ? "var(--icon-lightning)"
            : "var(--muted-foreground)",
        }}
        aria-hidden
      />
      {hasRecord ? (
        <span>
          Last strike{" "}
          <span className="tabular">{recentDistMi.toFixed(1)} mi</span>
          <span className="text-muted-foreground">
            {" · "}
            {formatRelative(recentEpochMs, now)}
          </span>
        </span>
      ) : (
        <span className="text-muted-foreground">No strikes recorded</span>
      )}
    </div>
  );

  const Expanded = (
    <div className="space-y-4">
      {/* Live "active storm" hero — surfaces the strikes/hr rate
          (= count_last_1hr) front-and-center while the storm is
          firing. Same role as the rain card's Current rate hero;
          collapses cleanly out of the layout when the hour goes
          quiet, so calm-weather expanded views are just the four
          historical tiles. */}
      {activeNow && (
        <ActiveRateHero
          label="Storm in progress"
          value={String(count1hr)}
          unit="strikes/hr"
          subtitle={
            hasRecord
              ? `Last strike ${recentDistMi.toFixed(1)} mi · ${formatRelative(recentEpochMs, now)}`
              : undefined
          }
          color="var(--icon-lightning)"
        />
      )}
      {/* Strike-count bars over the storm window. Hidden entirely
          when no strikes today — empty bars on a quiet day would
          read as a malfunction, not a metric. */}
      {histogram && (
        <div style={{ color: "var(--icon-lightning)" }}>
          <StormHistogram
            samples={histogram.samples}
            startMs={histogram.startMs}
            endMs={histogram.endMs}
            tz={tz}
            bucketMs={bucketMs}
            color="currentColor"
            ariaLabel="Strike count over the storm window"
            label="Lightning"
            unit="strikes"
            formatValue={(n) => Math.round(n).toString()}
          />
        </div>
      )}
      {/* Four historical totals. YTD pulls from the long-window
          aggregates endpoint (Tempest's pre-rolled daily counts via
          obs_st_ext) and shows "—" while in flight. Last strike +
          age moved to the hero subtitle (only when a storm is
          active) and the collapsed line — tiles here add NEW
          context the collapsed view can't, rather than repeating it. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="Today"
          value={totals.today != null ? String(totals.today) : "—"}
          unit={totals.today != null ? "strikes" : undefined}
        />
        <StatTile
          label="Yesterday"
          value={totals.yesterday != null ? String(totals.yesterday) : "—"}
          unit={totals.yesterday != null ? "strikes" : undefined}
        />
        <StatTile
          label="This month"
          value={totals.month != null ? String(totals.month) : "—"}
          unit={totals.month != null ? "strikes" : undefined}
        />
        <StatTile
          label="Year to date"
          value={ytdStrikes != null ? String(ytdStrikes) : "—"}
          unit={ytdStrikes != null ? "strikes" : undefined}
        />
      </div>
    </div>
  );

  return (
    <AdaptiveCard
      collapsed={Collapsed}
      expanded={Expanded}
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel="Lightning summary, click to toggle detail"
    />
  );
}

// `LightningTile` was a local copy of the same "label / value / unit /
// caption" pattern shared with `AdaptiveRainCard` and
// `HorizonBandCelestial`. Consolidated into `<StatTile>` in
// `components/shared/StatTile.tsx`.
