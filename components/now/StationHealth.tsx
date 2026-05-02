"use client";

import {
  Activity,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  Cpu,
  ExternalLink,
  Mountain,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useNow } from "@/lib/hooks/useNow";
import { formatRelative } from "@/lib/tempest/format";

/**
 * Station hardware status footer. Surfaces the data that actually
 * tells you whether the station is healthy:
 *
 *   - Last sample freshness (anchored to `obs.timestamp`, not the
 *     proxy fetch time)
 *   - Battery voltage from the latest device-obs sample, with the
 *     icon mapped to one of four levels (full / medium / low /
 *     warning) and a destructive-color treatment when voltage drops
 *     below the brownout threshold
 *   - Firmware revision (lets you spot whether the unit is up-to-date)
 *   - Elevation (informational; static for any given station)
 *
 * Layout: chips + "View on Tempest" link flow as a centered
 * horizontal group, wrapping to multiple lines on narrow viewports
 * (each wrapped line stays centered around its content). The link is
 * deliberately treated as just another item in the flow rather than
 * a right-pinned action — this footer is status metadata, not a
 * card-action region. The base Card sets `flex-col` so we override
 * with `!flex-row` to flow horizontally.
 *
 * RSSI / uptime would require restoring the `obs_st` WS subscription
 * (currently dropped because no UI consumes those samples).
 */

/**
 * Map a Tempest battery voltage to a four-level state. Thresholds
 * align with Tempest's published power-save modes AND the labeling
 * Tempest's own app uses (the Tempest app reports 2.5V as "Good",
 * which anchors the medium / low boundary at 2.5V — anything ≥2.5V
 * should read as healthy, not "low").
 *
 *   - **Firmware ≥175** (most stations) enables dynamic wind-sampling
 *     power save when voltage drops below ~2.65V. Above that, the
 *     station runs at full performance.
 *
 *   - **Older firmware** uses staged Mode 0–3. Mode 0 (full
 *     performance) holds at ≥2.455V. Mode 1 (reduced wind sampling)
 *     kicks in at ≤2.415V. Mode 3 (deep brownout, all sensors
 *     throttled to 5-min intervals) hits below ~2.355V. Per Tempest,
 *     "most stations never go below Mode 0 and >90% never go below
 *     Mode 1."
 *
 * The four icon levels:
 *   - `full`     ≥ 2.65V — no power save active on any firmware
 *   - `medium`   2.50–2.65V — Tempest app's "Good" band; FW 175+ may
 *                              be in light dynamic power save but the
 *                              station is healthy
 *   - `low`      2.41–2.50V — below Tempest's "Good" floor; older FW
 *                              still in Mode 0 but approaching Mode 1
 *   - `warning`  < 2.41V    — older FW in Mode 1+ (reduced wind
 *                              sampling); surface destructive color +
 *                              "(low)" label so the user notices
 */
type BatteryLevel = "full" | "medium" | "low" | "warning";

function batteryLevel(v: number): BatteryLevel {
  if (v < 2.41) return "warning";
  if (v < 2.5) return "low";
  if (v < 2.65) return "medium";
  return "full";
}

const BATTERY_ICONS: Record<BatteryLevel, LucideIcon> = {
  full: BatteryFull,
  medium: BatteryMedium,
  low: BatteryLow,
  warning: BatteryWarning,
};
export function StationHealth({
  lastSampleAt,
  batteryV,
  firmware,
  elevationM,
  stationId,
}: {
  /** epoch ms — the observation's own `timestamp` field. */
  lastSampleAt: number;
  /** Latest battery voltage from device-obs. */
  batteryV?: number | null;
  /** ST device firmware revision (string per Tempest schema). */
  firmware?: string | null;
  /** Station elevation in meters; rendered as feet for US conventions. */
  elevationM?: number | null;
  /** Tempest station ID — used to link to the public station page. */
  stationId?: number | null;
}) {
  // 60s tick aligns with every other consumer of `useNow()` in the
  // app. Faster polling here doesn't visibly help the "last sample N
  // ago" string at the granularity it's rendered ("just now" / "5 min
  // ago"), and it was the only component ticking off-cycle from the
  // shared 60s clock.
  const now = useNow(60_000);
  // Four-level icon mapping is described above in `batteryLevel`.
  // 2.50V matches the bottom of Tempest's own "Good" label, so
  // anything ≥2.50V renders at least `medium` (healthy). Warning
  // treatment (destructive color + "(low)" label) only triggers
  // below 2.41V — the documented Mode 1 (older firmware) /
  // dynamic-deep-save (FW 175+) transition.
  //
  // Use `Number.isFinite` (not `!= null`) because `NaN` would slip
  // through a nullish check — every numeric comparison against NaN
  // is false, which would walk through the level cascade and end up
  // returning "full". The chip would then render `NaN V` text and an
  // incorrect "fully charged" icon. Filtering non-finite values here
  // keeps the chip hidden when the source value is broken.
  const level =
    typeof batteryV === "number" && Number.isFinite(batteryV)
      ? batteryLevel(batteryV)
      : null;
  const isWarning = level === "warning";
  const elevationFt =
    elevationM != null ? Math.round(elevationM * 3.28084) : null;
  const tempestUrl =
    stationId != null
      ? `https://tempestwx.com/station/${stationId}`
      : "https://tempestwx.com/map";

  return (
    // Centered flat layout — all chips + the link sit as direct
    // children of the Card's flex-wrap row, centered as a group.
    // Each wrapped line stays centered independently, so a 2-line
    // mobile footer reads as two balanced rows of items rather than
    // a left-clustered group with a right-pinned link. The link
    // gets no special positioning (no `ml-auto`, no
    // `justify-between`); it flows as just another item, which
    // matches its role as secondary navigation rather than a
    // primary card action.
    <Card className="!flex-row flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 py-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Activity className="size-3.5" aria-hidden />
        last sample {formatRelative(lastSampleAt, now)}
      </span>
      {level != null && batteryV != null && (
        <span
          className={`inline-flex items-center gap-1.5 ${
            isWarning ? "text-destructive" : ""
          }`}
          title={`Battery ${level} (${batteryV.toFixed(2)} V)`}
        >
          {(() => {
            const Icon = BATTERY_ICONS[level];
            return <Icon className="size-3.5" aria-hidden />;
          })()}
          {/* Visible voltage + level for sighted users. The full
              phrase is duplicated in the screen-reader-only span
              so AT users hear "battery medium, 2.52 volts" rather
              than just "2.52 V". */}
          <span className="tabular" aria-hidden>
            {batteryV.toFixed(2)} V
          </span>
          {isWarning && <span aria-hidden>(low)</span>}
          <span className="sr-only">
            battery {level}, {batteryV.toFixed(2)} volts
            {isWarning ? " (low)" : ""}
          </span>
        </span>
      )}
      {firmware != null && firmware !== "" && (
        <span className="inline-flex items-center gap-1.5">
          <Cpu className="size-3.5" aria-hidden />
          firmware {firmware}
        </span>
      )}
      {elevationFt != null && (
        <span className="inline-flex items-center gap-1.5">
          <Mountain className="size-3.5" aria-hidden />
          <span className="tabular">{elevationFt.toLocaleString()} ft</span>
        </span>
      )}
      <a
        href={tempestUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        {/* "Tempest #{id}" surfaces the Station ID inline with the
            link — the dashboard already runs against one station per
            deploy (set via TEMPEST_STATION_ID), so showing it here
            answers "which station am I looking at?" without an extra
            chip. Tabular numerals so the ID renders crisp. Falls
            back to "Tempest map" when no ID is configured (matches
            the URL fallback above). */}
        Tempest
        {stationId != null ? (
          <span className="tabular">#{stationId}</span>
        ) : (
          <span>map</span>
        )}
        <ExternalLink className="size-3" aria-hidden />
        {/* Announce the new-tab behavior for screen-reader users;
            the visible link copy intentionally stays clean so
            sighted users read "Tempest #{id}" without the
            appendage. */}
        <span className="sr-only"> (opens in new tab)</span>
      </a>
    </Card>
  );
}
