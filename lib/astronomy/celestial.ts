/**
 * Extended celestial helpers backing the HorizonBand's expanded
 * celestial details panel. Wraps
 * `suncalc` for sun/moon events and adds three things the library
 * doesn't expose directly:
 *
 *   - `daylightDeltaMs`: today's daylight minus yesterday's (the "is
 *     the day getting longer or shorter?" question, in seconds).
 *   - `nextMoonPhase`: walks forward from `from` until the moon's
 *     illumination phase crosses the requested anchor (new = 0,
 *     full = 0.5). Linear interpolation between adjacent hourly
 *     samples gives minute-level accuracy without a closed-form
 *     ephemeris solver.
 *   - `nextSolstice`: closed-form from Meeus's *Astronomical Algorithms*
 *     ch. 27 — accurate to a few minutes for the next millennium,
 *     plenty for a "Jun 21" display.
 *
 * Everything returns `Date | null`; consumers are responsible for
 * formatting in the station's tz.
 */

import SunCalc from "suncalc";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// ─── Daylight ───────────────────────────────────────────────────────

/**
 * Today's daylight duration minus yesterday's, in milliseconds.
 * Positive = day is getting longer. Returns null if either day's
 * sunrise/sunset can't be resolved (extreme polar latitudes).
 */
export function daylightDeltaMs(
  todayMid: Date,
  lat: number,
  lon: number,
): number | null {
  const today = SunCalc.getTimes(todayMid, lat, lon);
  const yesterday = SunCalc.getTimes(
    new Date(todayMid.getTime() - DAY_MS),
    lat,
    lon,
  );
  if (
    !(today.sunrise instanceof Date) ||
    !(today.sunset instanceof Date) ||
    !(yesterday.sunrise instanceof Date) ||
    !(yesterday.sunset instanceof Date)
  ) {
    return null;
  }
  const todayMs = today.sunset.getTime() - today.sunrise.getTime();
  const yesterdayMs = yesterday.sunset.getTime() - yesterday.sunrise.getTime();
  return todayMs - yesterdayMs;
}

// ─── Moon phase milestones ──────────────────────────────────────────

/**
 * Walk forward from `from` until the lunar illumination phase crosses
 * the target anchor (new = 0/1 wrap, full = 0.5). Returns the moment
 * of crossing in UTC. Steps 1h at a time and linearly interpolates
 * between the two bracketing samples.
 *
 * `from` is the search start; the function advances strictly forward,
 * so passing `now` returns the *next* phase, not the current one.
 */
export function nextMoonPhase(
  from: Date,
  target: "new" | "full",
): Date | null {
  const start = from.getTime();
  let prevPhase = SunCalc.getMoonIllumination(from).phase;

  // 35 days covers two synodic months — enough headroom for any
  // "next" lookup regardless of the start moment.
  for (let i = 1; i <= 24 * 35; i++) {
    const at = new Date(start + i * HOUR_MS);
    const curPhase = SunCalc.getMoonIllumination(at).phase;

    if (target === "full") {
      // Crosses 0.5 going up.
      if (prevPhase < 0.5 && curPhase >= 0.5) {
        const t = (0.5 - prevPhase) / (curPhase - prevPhase);
        return new Date(start + (i - 1 + t) * HOUR_MS);
      }
    } else {
      // New moon: phase wraps from ~1 to ~0. Treat prevPhase as
      // (prevPhase - 1) so we have a continuous monotone segment
      // crossing zero.
      if (prevPhase > 0.5 && curPhase < 0.5) {
        const wrappedPrev = prevPhase - 1; // negative
        const t = -wrappedPrev / (curPhase - wrappedPrev);
        return new Date(start + (i - 1 + t) * HOUR_MS);
      }
    }
    prevPhase = curPhase;
  }
  return null;
}

// ─── Solstices ──────────────────────────────────────────────────────

/** Julian Ephemeris Day of the requested solstice for `year`. */
function solsticeJde(year: number, kind: "summer" | "winter"): number {
  const Y = (year - 2000) / 1000;
  if (kind === "summer") {
    return (
      2451716.56767 +
      365241.62603 * Y +
      0.00325 * Y * Y +
      0.00888 * Y * Y * Y -
      0.0003 * Y * Y * Y * Y
    );
  }
  return (
    2451900.05952 +
    365242.74049 * Y -
    0.06223 * Y * Y -
    0.00823 * Y * Y * Y +
    0.00032 * Y * Y * Y * Y
  );
}

function jdeToDate(jde: number): Date {
  // Julian Day → Unix epoch ms.
  return new Date((jde - 2440587.5) * DAY_MS);
}

/**
 * Next northern-hemisphere summer or winter solstice strictly after
 * `from`. We don't surface equinoxes — they're less culturally salient
 * than the longest/shortest day, and the card is already dense.
 */
export function nextSolstice(
  from: Date,
): { kind: "summer" | "winter"; date: Date } | null {
  const year = from.getUTCFullYear();
  const candidates: { kind: "summer" | "winter"; date: Date }[] = [
    { kind: "summer", date: jdeToDate(solsticeJde(year, "summer")) },
    { kind: "winter", date: jdeToDate(solsticeJde(year, "winter")) },
    { kind: "summer", date: jdeToDate(solsticeJde(year + 1, "summer")) },
    { kind: "winter", date: jdeToDate(solsticeJde(year + 1, "winter")) },
  ];
  const future = candidates
    .filter((c) => c.date.getTime() > from.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return future[0] ?? null;
}

// `moonPhaseName` lives in `lib/astronomy/horizon.ts` — the only
// consumers (HorizonBand, HorizonBandCelestial) import from there.
// A second copy used to live here under a "(re-export for
// convenience)" comment but it wasn't a re-export at all and rendered
// in different casing, which created a footgun for anyone reaching
// for the function via autocomplete.
