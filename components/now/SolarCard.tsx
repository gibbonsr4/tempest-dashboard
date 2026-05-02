"use client";

import * as React from "react";
import { useRecentHistory } from "@/lib/hooks/useRecentHistory";
import { solarBand, uvBand } from "@/lib/tempest/interpret";
import type { StationObs } from "@/lib/tempest/types";
import { MetricTile } from "./MetricTile";

/**
 * UV / sun-exposure tile. UV index is the headline (a 0–11+ scale that
 * actually drives sunscreen decisions) with raw solar radiation in
 * W/m² shown as supporting detail. At night W/m² is always 0 so
 * leading with that number was misleading; UV stays meaningful through
 * the day and the watts give context for when relevant.
 *
 * Nighttime handling: both `solar_radiation` and `uv` are 0 when the
 * sun is below the horizon. Without a special case, `solarBand(0)`
 * returns "Overcast" — true cause of low light during the day, but
 * absurd as the night-time caption ("0 W/m² · overcast" at midnight).
 * When both values are 0, swap the caption to "After sunset" so the
 * card explains *why* the value is 0 rather than misattributing it
 * to weather. We don't pull station coords + SunCalc here because
 * the dual-zero heuristic is exact: the AS3935 + UV sensors both
 * report literal zero only when the sun is physically below horizon.
 */
export function SolarCard({ obs }: { obs: StationObs }) {
  const uv = obs.uv ?? null;
  const wm2 = obs.solar_radiation ?? null;
  const history = useRecentHistory(24);

  const isNight = wm2 === 0 && (uv == null || uv === 0);

  const detail =
    wm2 == null
      ? undefined
      : isNight
        ? "After sunset"
        : `${Math.round(wm2)} W/m² · ${solarBand(wm2).label.toLowerCase()}`;

  // UV trend over the last 24h. Drops to 0 at night by design — the
  // sparkline showing a daily peak-and-trough is exactly the shape
  // we want, since "is the sun up?" is the dominant question.
  const uvSpark = React.useMemo(
    () =>
      history.data?.samples
        .map((s) => s.uv)
        .filter((v): v is number => v != null) ?? [],
    // Depend on `samples` (the actual input), not `data` (a wrapper
    // ref TanStack returns fresh on every refetch even when samples
    // is unchanged).
    [history.data?.samples],
  );

  return (
    <MetricTile
      label="UV index"
      value={uv != null ? uv.toFixed(1) : "—"}
      status={isNight ? null : uv != null ? uvBand(uv) : null}
      detail={detail}
      spark={uvSpark}
    />
  );
}
