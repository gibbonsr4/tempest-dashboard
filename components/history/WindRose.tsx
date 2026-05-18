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
  | {
      kind: "daily";
      rows: DeviceDailyAggregate[];
      /** Previous-period daily aggregates — forwarded to MonthlyWindGrid
       *  to surface a "vs avg / peak" line per month tile. */
      compareRows?: DeviceDailyAggregate[];
      /** Pre-formatted span label for the card header. Overrides the
       *  in-grid `totalDays` derivation so calendar ranges can read
       *  in months ("12 months") rather than days ("365 days"). */
      spanLabel?: string;
    };

export function WindRose(props: WindRoseProps) {
  if (props.kind === "daily") {
    return (
      <MonthlyWindGrid
        rows={props.rows}
        compareRows={props.compareRows}
        spanLabel={props.spanLabel}
      />
    );
  }
  return <SamplesWindRose samples={props.samples} />;
}
