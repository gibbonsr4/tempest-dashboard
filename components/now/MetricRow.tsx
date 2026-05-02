"use client";

import * as React from "react";
import { useRecentHistory } from "@/lib/hooks/useRecentHistory";
import { cToF } from "@/lib/tempest/conversions";
import { humidityBand } from "@/lib/tempest/interpret";
import type { StationObs } from "@/lib/tempest/types";
import { AirQualityCard } from "./AirQualityCard";
import { MetricTile } from "./MetricTile";
import { PressureCard } from "./PressureCard";
import { SolarCard } from "./SolarCard";

/**
 * Single 4-card row of metric tiles. Humidity uses the dew point as
 * its supporting detail line — they're directly related (dew point is
 * the temperature at which the current moisture content would
 * saturate), so the dew point gives concrete grounding to the percent.
 *
 * `useRecentHistory(24)` is called both here (for the humidity
 * sparkline) and inside `PressureCard` for the pressure sparkline.
 * TanStack Query dedupes by query key, so the second call hits cache
 * with no extra fetch — keeping the sparkline data flow co-located
 * with each card while sharing a single buffer.
 */
export function MetricRow({ obs }: { obs: StationObs }) {
  const rh = obs.relative_humidity ?? null;
  const dewC = obs.dew_point ?? null;
  const dewF = dewC != null ? cToF(dewC) : null;
  const history = useRecentHistory(24);
  const humiditySpark = React.useMemo(
    () =>
      history.data?.samples
        .map((s) => s.humidityPct)
        .filter((v): v is number => v != null) ?? [],
    // Depend on `samples` (the actual input), not `data` (a wrapper
    // ref that TanStack returns fresh on every refetch even when
    // `samples` is unchanged). Same fix in PressureCard / SolarCard.
    [history.data?.samples],
  );

  return (
    // `auto-rows-fr` keeps the two rows of the mobile 2×2 layout the
    // same height. Without it, a row whose tallest tile happens to
    // wrap a status chip ("Unhealthy for Sensitive Groups") could
    // grow taller than its peer row, leaving the layout uneven.
    // Combined with `mt-auto` on the detail line inside each
    // `<MetricTile />` (header + value tight at the top, detail
    // pinned to the bottom), the result is consistent rhythm across
    // all four tiles regardless of which has the longest status /
    // detail copy.
    <div className="grid auto-rows-fr grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricTile
        label="Humidity"
        value={rh != null ? Math.round(rh) : "—"}
        unit="%"
        status={rh != null ? humidityBand(rh) : null}
        detail={dewF != null ? `Dew point ${Math.round(dewF)}°F` : undefined}
        spark={humiditySpark}
      />
      <PressureCard obs={obs} />
      <SolarCard obs={obs} />
      <AirQualityCard />
    </div>
  );
}
