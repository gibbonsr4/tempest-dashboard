"use client";

import * as React from "react";
import { Sunrise, Sunset } from "lucide-react";
import { cToF } from "@/lib/tempest/conversions";
import { formatClock } from "@/lib/tempest/format";
import { useStationTz } from "@/lib/tempest/tz-context";
import { useNow } from "@/lib/hooks/useNow";
import type { ForecastDaily, ForecastHourly } from "@/lib/tempest/types";
import { WeatherIcon } from "./WeatherIcon";

/**
 * Apple-Weather-style next-six-hours strip. Six cells across, each
 * showing time / icon / temp. When sunrise or sunset falls inside the
 * 6-hour window, the *single nearest* cell swaps its icon to a
 * sunrise / sunset glyph and the time switches to the exact event time.
 *
 * Two correctness notes:
 *
 * - **argmin, not symmetric ±30min**: if sunrise lands at exactly
 *   :30 between two hourly cells, both would satisfy a `±30min`
 *   predicate and render the same icon twice. Picking the closest
 *   cell index guarantees one event = one cell.
 *
 * - **late-evening windows cross midnight**, so the strip needs
 *   tomorrow's sunrise too. We accept `days: ForecastDaily[]` and
 *   walk every entry, picking the sun event whose timestamp falls
 *   inside `[firstCellTs - 30min, lastCellTs + 30min]`.
 *
 * The strip pulls from `forecast.hourly[]` starting at the earliest
 * entry that's at or after the current hour minus a half-hour grace
 * window — the user's "now" lives in the bigger hero readout above;
 * this band is "what's coming".
 */
export function HeroForecastStrip({
  hourly,
  days,
}: {
  hourly: ForecastHourly[];
  days: ForecastDaily[];
}) {
  const now = useNow();
  const tz = useStationTz();

  const upcoming = React.useMemo(() => {
    const startMs = now;
    return hourly
      .filter((h) => h.time * 1000 >= startMs - 30 * 60_000)
      .slice(0, 6);
  }, [hourly, now]);

  // Window covers the cells we render plus a half-hour grace either side
  // so an event landing right on a boundary still claims a nearest cell.
  const windowStart = upcoming.length > 0 ? upcoming[0].time * 1000 - 30 * 60_000 : 0;
  const windowEnd = upcoming.length > 0 ? upcoming[upcoming.length - 1].time * 1000 + 30 * 60_000 : 0;

  const cellTimestamps = upcoming.map((h) => h.time * 1000);

  // Find the single nearest cell index for an event timestamp, or -1
  // if no cell is within the half-hour grace window.
  const nearestCellIdx = React.useCallback(
    (eventMs: number | null): number => {
      if (eventMs == null) return -1;
      if (eventMs < windowStart || eventMs > windowEnd) return -1;
      let bestIdx = -1;
      let bestDelta = Infinity;
      for (let i = 0; i < cellTimestamps.length; i++) {
        const delta = Math.abs(cellTimestamps[i] - eventMs);
        if (delta < bestDelta && delta <= 30 * 60_000) {
          bestDelta = delta;
          bestIdx = i;
        }
      }
      return bestIdx;
    },
    [cellTimestamps, windowStart, windowEnd],
  );

  // Walk every day in `days` and resolve the sunrise / sunset events
  // that intersect the visible window. This is the cross-midnight fix:
  // late-evening windows pick up tomorrow's sunrise from `days[1]`.
  type SunEvent = { ts: number; cellIdx: number };
  const { sunriseHit, sunsetHit } = React.useMemo(() => {
    let sr: SunEvent | null = null;
    let ss: SunEvent | null = null;
    for (const d of days) {
      if (d.sunrise) {
        const ts = d.sunrise * 1000;
        const idx = nearestCellIdx(ts);
        if (idx >= 0 && (sr == null || idx < sr.cellIdx)) sr = { ts, cellIdx: idx };
      }
      if (d.sunset) {
        const ts = d.sunset * 1000;
        const idx = nearestCellIdx(ts);
        if (idx >= 0 && (ss == null || idx < ss.cellIdx)) ss = { ts, cellIdx: idx };
      }
    }
    return { sunriseHit: sr, sunsetHit: ss };
  }, [days, nearestCellIdx]);

  if (upcoming.length === 0) return null;

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${upcoming.length}, minmax(0, 1fr))` }}
    >
      {upcoming.map((h, i) => {
        const ts = h.time * 1000;
        const tF = h.air_temperature != null ? cToF(h.air_temperature) : null;
        const isSunrise = sunriseHit?.cellIdx === i;
        const isSunset = sunsetHit?.cellIdx === i;

        // Sunrise/sunset cells drop the AM/PM suffix — the dedicated
        // glyph already conveys morning vs evening, and the shorter
        // string ("5:41" vs "5:41 AM") fits the cell on narrow viewports
        // where neighbouring "5 AM" cells comfortably do.
        const timeLabel = isSunrise && sunriseHit
          ? formatClock(sunriseHit.ts, tz).replace(/\s?[AP]M$/i, "")
          : isSunset && sunsetHit
            ? formatClock(sunsetHit.ts, tz).replace(/\s?[AP]M$/i, "")
            : formatClock(ts, tz);

        return (
          <div
            key={`${ts}-${i}`}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-border/40 bg-card/40 px-1 py-2"
          >
            <span className="whitespace-nowrap text-[10px] tabular text-muted-foreground">
              {timeLabel.replace(":00", "")}
            </span>
            {isSunrise ? (
              <Sunrise
                className="size-5"
                style={{ color: "var(--sunrise-marker)" }}
                aria-label="Sunrise"
              />
            ) : isSunset ? (
              <Sunset
                className="size-5"
                style={{ color: "var(--sunset-marker)" }}
                aria-label="Sunset"
              />
            ) : (
              <WeatherIcon
                icon={h.icon}
                className="size-5 text-primary/80"
                ariaLabel={h.conditions ?? undefined}
              />
            )}
            <span className="tabular text-sm font-medium">
              {tF != null ? `${Math.round(tF)}°` : "—"}
            </span>
            {h.precip_probability != null && h.precip_probability >= 20 && (
              <span
                className="tabular text-[9px]"
                style={{ color: "var(--icon-rain)" }}
              >
                💧{Math.round(h.precip_probability)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
