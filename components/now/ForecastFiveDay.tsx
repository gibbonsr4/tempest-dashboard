"use client";

import { Card } from "@/components/ui/card";
import { cToF } from "@/lib/tempest/conversions";
import { formatWeekday } from "@/lib/tempest/format";
import { useStationTz } from "@/lib/tempest/tz-context";
import type { ForecastDaily } from "@/lib/tempest/types";
import { WeatherIcon } from "./WeatherIcon";

/**
 * 5-day strip starting tomorrow (today is in the hero block already).
 * If fewer than 6 days are present in the upstream payload we render
 * what we have — the skeleton inside each card guarantees consistent
 * dimensions.
 */
export function ForecastFiveDay({ days }: { days: ForecastDaily[] }) {
  const tz = useStationTz();
  // Skip today's entry; show the next five upcoming days
  const upcoming = days.slice(1, 6);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
        <span>5-day outlook</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {upcoming.map((d, i) => {
          const dateMs = d.day_start_local ? d.day_start_local * 1000 : null;
          const hi = d.air_temp_high != null ? cToF(d.air_temp_high) : null;
          const lo = d.air_temp_low != null ? cToF(d.air_temp_low) : null;
          const pop = d.precip_probability ?? null;
          return (
            <div
              key={`${d.day_start_local}-${i}`}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-border/50 bg-card/40 px-2 py-3"
            >
              <div className="text-xs text-muted-foreground">
                {dateMs ? formatWeekday(dateMs, tz) : "—"}
              </div>
              <WeatherIcon icon={d.icon} className="size-6 text-primary/80" />
              <div className="flex items-baseline gap-1.5 tabular text-sm">
                <span className="font-medium">
                  {hi != null ? Math.round(hi) : "—"}°
                </span>
                <span className="text-muted-foreground">
                  {lo != null ? Math.round(lo) : "—"}°
                </span>
              </div>
              {pop != null && pop > 0 && (
                <div className="tabular text-[10px] text-muted-foreground">
                  💧 {Math.round(pop)}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
