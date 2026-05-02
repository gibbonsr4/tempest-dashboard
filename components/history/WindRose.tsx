"use client";

import type { HistorySample } from "@/lib/hooks/useRecentHistory";
import type { DeviceDailyAggregate } from "@/lib/tempest/server-client";
import { SamplesWindRose } from "./WindRoseSamples";
import { MonthlyWindGrid } from "./WindRoseMonthly";

/**
 * Wind direction visualization with two distinct modes that match what
 * each data source can honestly say.
 *
 * - **`kind: "samples"` (short range)** — classic 16-direction × 5-band
 *   wind rose. See `WindRoseSamples.tsx` for the implementation.
 *
 * - **`kind: "daily"` (long range)** — compact monthly stats grid.
 *   See `WindRoseMonthly.tsx`.
 *
 * The two implementations live in sibling files; this dispatcher is
 * the single import surface for consumers (`HistoryClient.tsx`) and
 * the home for shared constants (`DIR_BINS`).
 */

/** 16 compass-direction bins, every 22.5°. Shared between the
 *  samples-based rose and the daily-aggregate monthly grid. */
export const DIR_BINS = 16;

export type WindRoseProps =
  | { kind: "samples"; samples: HistorySample[] }
  | { kind: "daily"; rows: DeviceDailyAggregate[] };

export function WindRose(props: WindRoseProps) {
  if (props.kind === "daily") {
    return <MonthlyWindGrid rows={props.rows} />;
  }
  return <SamplesWindRose samples={props.samples} />;
}
