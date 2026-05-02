/**
 * Wrapper around `suncalc` providing the data the HorizonBand component
 * needs to render a single 24-hour day: sun + moon arcs (sampled),
 * key event times (sunrise, solar noon, sunset, moonrise, moonset),
 * and the moon-phase fraction.
 *
 * The sampling resolution is per-15-minutes (96 samples/day) — enough
 * for smooth arcs at typical band widths without bloating the JSON sent
 * down to the client.
 */

import SunCalc from "suncalc";

export interface HorizonSample {
  /** epoch ms */
  ts: number;
  /** altitude in radians (positive = above horizon) */
  sunAlt: number;
  /** azimuth in radians (south-clockwise convention from suncalc) */
  sunAz: number;
  /** lunar altitude in radians */
  moonAlt: number;
  /** lunar azimuth in radians */
  moonAz: number;
}

export interface HorizonData {
  /** epoch ms — start of the local day used for sampling */
  dayStart: number;
  /** epoch ms — end of the local day (start + 24h) */
  dayEnd: number;
  /** key event times in epoch ms; null when the event does not occur */
  events: {
    sunrise: number | null;
    solarNoon: number | null;
    sunset: number | null;
    dawn: number | null;
    dusk: number | null;
    nauticalDawn: number | null;
    nauticalDusk: number | null;
    nightEnd: number | null;
    night: number | null;
    moonrise: number | null;
    moonset: number | null;
  };
  /** Phase fraction 0..1 (0/1 = new, 0.5 = full). */
  moonPhase: number;
  /** Illuminated fraction 0..1. */
  moonFraction: number;
  /** Sampled sun + moon positions across the day. */
  samples: HorizonSample[];
}

const SAMPLES_PER_DAY = 96;

const ms = (d: Date | null | undefined): number | null =>
  d instanceof Date && !isNaN(d.getTime()) ? d.getTime() : null;

/**
 * Compute horizon data for a given day. `dayStart` should be midnight
 * in the station's local zone (or any monotonic 24-hour anchor). The
 * caller is responsible for tz alignment — we treat times as opaque
 * epoch ms and let the renderer place them on its x scale.
 */
export function horizonForDay(
  dayStart: Date,
  lat: number,
  lon: number,
): HorizonData {
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  // Pass suncalc the day's MIDDAY rather than midnight so the
  // Julian-cycle math unambiguously lands on today's solar / lunar
  // transits. At midnight, depending on the location's longitude,
  // the cycle can round to yesterday's transit and return yesterday's
  // events instead. This applies equally to `getMoonTimes` (R3) —
  // pass `dayMid` consistently across all three "what happens on
  // this day" calls.
  const dayMid = new Date(dayStart.getTime() + 12 * 3600_000);
  const times = SunCalc.getTimes(dayMid, lat, lon);
  const moonTimes = SunCalc.getMoonTimes(dayMid, lat, lon);
  const moonIll = SunCalc.getMoonIllumination(dayMid);

  const samples: HorizonSample[] = [];
  const step = 86_400_000 / SAMPLES_PER_DAY;
  for (let i = 0; i <= SAMPLES_PER_DAY; i++) {
    const t = dayStart.getTime() + i * step;
    const sun = SunCalc.getPosition(new Date(t), lat, lon);
    const moon = SunCalc.getMoonPosition(new Date(t), lat, lon);
    samples.push({
      ts: t,
      sunAlt: sun.altitude,
      sunAz: sun.azimuth,
      moonAlt: moon.altitude,
      moonAz: moon.azimuth,
    });
  }

  return {
    dayStart: dayStart.getTime(),
    dayEnd: dayEnd.getTime(),
    events: {
      sunrise: ms(times.sunrise),
      solarNoon: ms(times.solarNoon),
      sunset: ms(times.sunset),
      dawn: ms(times.dawn),
      dusk: ms(times.dusk),
      nauticalDawn: ms(times.nauticalDawn),
      nauticalDusk: ms(times.nauticalDusk),
      nightEnd: ms(times.nightEnd),
      night: ms(times.night),
      moonrise: ms(moonTimes.rise),
      moonset: ms(moonTimes.set),
    },
    moonPhase: moonIll.phase,
    moonFraction: moonIll.fraction,
    samples,
  };
}

/** Friendly phase name for display. Matches NASA's eight-phase convention. */
export function moonPhaseName(phase: number): string {
  // phase 0/1 = new moon, 0.5 = full
  if (phase < 0.03 || phase > 0.97) return "new moon";
  if (phase < 0.22) return "waxing crescent";
  if (phase < 0.28) return "first quarter";
  if (phase < 0.47) return "waxing gibbous";
  if (phase < 0.53) return "full moon";
  if (phase < 0.72) return "waning gibbous";
  if (phase < 0.78) return "last quarter";
  return "waning crescent";
}
