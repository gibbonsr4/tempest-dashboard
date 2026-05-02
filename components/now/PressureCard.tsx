"use client";

import * as React from "react";
import { useRecentHistory } from "@/lib/hooks/useRecentHistory";
import { mbToInHg } from "@/lib/tempest/conversions";
import {
  interpretPressure,
  pressureBand,
  pressureRateMbPerHr,
} from "@/lib/tempest/interpret";
import type { StationObs } from "@/lib/tempest/types";
import { MetricTile } from "./MetricTile";

/**
 * Pressure tile. Uses the unified MetricTile shell so it lives in the
 * same visual language as Humidity / UV / AQI. The status chip shows
 * the coarse trend label (Rising / Steady / Falling) sourced from
 * Tempest's `pressure_trend` field; the inline arrow + detail phrase
 * come from a real 3-hour rate computed against the recent-history
 * buffer (`pressureRateMbPerHr`), so the dramatic "rising rapidly —
 * clearing fast" / "falling rapidly — storm approaching" branches
 * actually fire when the atmosphere warrants them. Previously the
 * card synthesized ±0.5 mb/hr from the coarse label and could never
 * escape the "fair / unsettled" middle ground.
 */
export function PressureCard({ obs }: { obs: StationObs }) {
  const history = useRecentHistory(24);
  // Display value preferentially uses sea-level pressure (the
  // forecasting-friendly basis), falling back to station pressure
  // when the API doesn't provide it.
  const displayMb = obs.sea_level_pressure ?? obs.station_pressure ?? null;
  const inHg = displayMb != null ? mbToInHg(displayMb) : null;
  const trendStr = obs.pressure_trend ?? null;
  const status = pressureBand(trendStr);

  // Rate is computed against `station_pressure` exclusively because
  // that's what the history payload carries (`ST_INDEX.stationPressureMb`).
  // Mixing bases — current sea-level vs. historical station — bakes
  // the constant elevation offset (which can run tens of millibars
  // depending on the station's altitude) into the delta and would
  // always read "rising rapidly".
  const stationMb = obs.station_pressure ?? null;
  const rateMbPerHr = pressureRateMbPerHr(
    history.data?.samples ?? [],
    stationMb,
  );
  const trend = interpretPressure(rateMbPerHr);

  // Sparkline plots station pressure (the basis the history payload
  // carries). The headline shows sea-level pressure — the absolute
  // values differ by a constant elevation offset, but the *shape* is
  // identical, so the trend line still answers "rising or falling?"
  // correctly. See MetricTile docstring for the longer note.
  const pressureSpark = React.useMemo(
    () =>
      history.data?.samples
        .map((s) => s.pressureMb)
        .filter((v): v is number => v != null) ?? [],
    // Depend on `samples` (the actual input), not `data` (a wrapper
    // ref TanStack returns fresh on every refetch even when samples
    // is unchanged).
    [history.data?.samples],
  );

  return (
    <MetricTile
      label="Pressure"
      value={inHg != null ? inHg.toFixed(2) : "—"}
      unit="inHg"
      prefix={trend.arrow}
      status={status}
      detail={trend.hint}
      spark={pressureSpark}
    />
  );
}
