"use client";

import * as React from "react";
import { Sunrise, Sunset } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useNow } from "@/lib/hooks/useNow";
import { cToF, mpsToMph } from "@/lib/tempest/conversions";
import { conditionsPhrase, uvBand } from "@/lib/tempest/interpret";
import { formatClock, formatDuration } from "@/lib/tempest/format";
import { useStationTz } from "@/lib/tempest/tz-context";
import type {
  ForecastDaily,
  ForecastHourly,
  StationObs,
} from "@/lib/tempest/types";
import { ComfortChip } from "./ComfortChip";
import { HeroForecastStrip } from "./HeroForecastStrip";
import { WeatherIcon } from "./WeatherIcon";

/**
 * Hero block — the dashboard's biggest moment. Big temp + a 24-hour
 * temp sparkline beside it; feels-like / hi-lo / UV summary below;
 * conditions phrase chip; and a sunrise-left / sunset-right footer
 * with total-daylight summary.
 *
 * Sun progress lives in the HorizonBand below, so the hero footer
 * stays a clean information row without a redundant progress bar.
 */
export function HeroBlock({
  obs,
  today,
  days,
  hourly,
  conditions,
  iconName,
}: {
  obs: StationObs;
  today: ForecastDaily | null;
  /** Full daily-forecast array, threaded down to HeroForecastStrip
   *  so its 6-hour window can pick up tomorrow's sunrise after dark. */
  days: ForecastDaily[];
  hourly: ForecastHourly[];
  conditions: string | null;
  iconName: string | null;
}) {
  const now = useNow();
  const tz = useStationTz();

  const tempC = obs.air_temperature ?? null;
  const tempF = tempC != null ? cToF(tempC) : null;

  const feelsC = obs.feels_like ?? null;
  const feelsF = feelsC != null ? cToF(feelsC) : null;

  const hiC = today?.air_temp_high ?? null;
  const loC = today?.air_temp_low ?? null;
  const hiF = hiC != null ? cToF(hiC) : null;
  const loF = loC != null ? cToF(loC) : null;

  const uv = obs.uv ?? null;
  const uvLabel = uv != null ? uvBand(uv) : null;

  const phrase = tempF != null
    ? conditionsPhrase({
        tempF,
        feelsLikeF: feelsF,
        humidity: obs.relative_humidity ?? null,
        uv,
        windMph: obs.wind_avg != null ? mpsToMph(obs.wind_avg) : null,
      })
    : "Awaiting current conditions";

  const sunriseMs = today?.sunrise ? today.sunrise * 1000 : null;
  const sunsetMs = today?.sunset ? today.sunset * 1000 : null;
  // Snapshot the daylight window into a single struct that's either
  // null (unknown) or fully populated (both sunrise and sunset valid).
  // Lets the phrase logic below avoid the `sunriseMs! / sunsetMs!`
  // non-null assertions the previous shape required.
  const daylight =
    sunriseMs != null && sunsetMs != null && sunsetMs > sunriseMs
      ? { sunriseMs, sunsetMs, totalMs: sunsetMs - sunriseMs }
      : null;
  const daylightPhrase = daylight
    ? now < daylight.sunriseMs
      ? `daylight in ${formatDuration(daylight.sunriseMs - now)}`
      : now > daylight.sunsetMs
        ? `${formatDuration(daylight.totalMs)} of daylight today`
        : `${formatDuration(daylight.sunsetMs - now)} of daylight left`
    : null;

  return (
    <Card className="relative flex flex-col gap-3 overflow-hidden p-5">
      {/* Top row holds just the headline temp on the left and the
          weather icon + conditions on the right. The supporting
          stats row used to live inside the left column, which kept
          it boxed-in to ~half the Card width on mobile and forced
          three pieces (feels-like, high/low, UV) to wrap into 5+
          lines while the right column had empty space below the
          icon. Lifting the stats row to span the full Card width
          gives it the horizontal room it needs and matches the
          visual weight of the comfort chip directly below it. */}
      <div className="flex items-start justify-between gap-6">
        <div className="tabular text-7xl font-light leading-none tracking-tight">
          {tempF != null ? Math.round(tempF) : "—"}
          <span className="ml-1 align-super text-3xl text-muted-foreground">
            °F
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <WeatherIcon
            icon={iconName}
            className="size-12 text-primary/80"
            ariaLabel={conditions ?? undefined}
          />
          {conditions && (
            <div className="text-right text-sm text-foreground/80">
              {conditions}
            </div>
          )}
        </div>
      </div>

      {/* Supporting stats — full Card width. Consistent
          "Label value°" format for each cluster so they read as a
          coordinated group rather than three independent fragments;
          dividers (·) carry the rhythm on desktop but are hidden
          on mobile, where they'd otherwise wrap to their own lines
          (the · is its own flex child) and balloon a 3-piece row
          into a 5-line stack. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted-foreground">
        {feelsF != null && (
          <span className="tabular">
            Feels like{" "}
            <span className="text-foreground">{Math.round(feelsF)}°</span>
          </span>
        )}
        {hiF != null && loF != null && (
          <>
            <span className="hidden text-muted-foreground/40 sm:inline">·</span>
            <span className="tabular">
              High <span className="text-foreground">{Math.round(hiF)}°</span> /
              Low <span className="text-foreground">{Math.round(loF)}°</span>
            </span>
          </>
        )}
        {uv != null && uvLabel && (
          <>
            <span className="hidden text-muted-foreground/40 sm:inline">·</span>
            <span className="tabular">
              UV <span className="text-foreground">{uv.toFixed(1)}</span>{" "}
              <span style={{ color: uvLabel.color }}>{uvLabel.label}</span>
            </span>
          </>
        )}
      </div>

      <ComfortChip phrase={phrase} />

      {hourly.length > 0 && <HeroForecastStrip hourly={hourly} days={days} />}

      <div className="flex items-end justify-between gap-4 border-t pt-3 text-xs text-muted-foreground">
        {sunriseMs ? (
          <div className="flex items-center gap-2">
            <Sunrise className="size-4 text-primary/70" aria-hidden />
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] uppercase tracking-wide">
                Sunrise
              </span>
              <span className="tabular text-foreground">
                {formatClock(sunriseMs, tz)}
              </span>
            </div>
          </div>
        ) : (
          <span />
        )}

        {daylightPhrase && (
          <span className="hidden tabular sm:inline">{daylightPhrase}</span>
        )}

        {sunsetMs ? (
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end leading-tight">
              <span className="text-[10px] uppercase tracking-wide">
                Sunset
              </span>
              <span className="tabular text-foreground">
                {formatClock(sunsetMs, tz)}
              </span>
            </div>
            <Sunset className="size-4 text-primary/70" aria-hidden />
          </div>
        ) : (
          <span />
        )}
      </div>
    </Card>
  );
}
