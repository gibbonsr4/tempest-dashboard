"use client";

import { Card } from "@/components/ui/card";
import { cToF } from "@/lib/tempest/conversions";
import { formatWeekday } from "@/lib/tempest/format";
import { useStationTz } from "@/lib/tempest/tz-context";
import type { ForecastDaily as ForecastDay } from "@/lib/tempest/types";
import { WeatherIcon } from "./WeatherIcon";

/**
 * Multi-day outlook strip starting tomorrow (today's already in the
 * hero block above). Renders every available upstream day as a
 * horizontally scrollable row of fixed-width cells, mirroring the
 * `HeroForecastStrip` UX pattern. The Tempest forecast feed
 * typically returns 10 days; we render whatever's there.
 *
 * Scrollbar is hidden on both engine families (`-webkit-` for Safari /
 * Chrome, `scrollbar-width: none` for Firefox). Cells are
 * `shrink-0` with a fixed `w-20` so the rhythm reads consistently
 * across viewport widths — on mobile the row scrolls smoothly
 * under a finger; on desktop, when all cells fit, no scroll is
 * needed.
 */
export function ForecastDaily({ days }: { days: ForecastDay[] }) {
  const tz = useStationTz();
  // Skip today's entry; show every upcoming day.
  const upcoming = days.slice(1);
  const headerLabel = `${upcoming.length}-day outlook`;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
        <span>{headerLabel}</span>
      </div>
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-3">
          {upcoming.map((d, i) => {
            const dateMs = d.day_start_local ? d.day_start_local * 1000 : null;
            const hi = d.air_temp_high != null ? cToF(d.air_temp_high) : null;
            const lo = d.air_temp_low != null ? cToF(d.air_temp_low) : null;
            const pop = d.precip_probability ?? null;
            return (
              <div
                key={`${d.day_start_local}-${i}`}
                className="flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-lg border border-border/50 bg-card/40 px-2 py-3"
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
      </div>
    </Card>
  );
}
