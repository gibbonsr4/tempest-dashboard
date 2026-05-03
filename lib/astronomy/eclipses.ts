/**
 * Curated upcoming eclipses, sourced from NASA's Five Millennium
 * Catalog of Solar Eclipses (eclipse.gsfc.nasa.gov/SEcat5/) and the
 * companion lunar catalog. Refresh every few years — the catalog runs
 * for centuries so the underlying data is stable, but the array below
 * is a snapshot. Either extend the tail when the listed window runs
 * short, or swap in a computational backend (e.g. astronomy-engine)
 * if zero-maintenance becomes more valuable than the small TS file.
 *
 * Approach: instead of computing eclipses from ephemeris (a
 * non-trivial pile of code, ~250 KB if we pull a library), we ship
 * a tiny static dataset and a "next event after `from`" lookup.
 * Region strings come straight from NASA's path descriptors so users
 * can read at a glance whether their station's region applies. We
 * deliberately don't compute path-of-totality membership for the
 * specific station lat/lon — that's a future-session concern if it
 * ever proves valuable.
 */

export interface EclipseEvent {
  /** ISO date — the calendar day of greatest eclipse. */
  date: string;
  kind: "solar" | "lunar";
  /** Eclipse type per NASA catalog. */
  type:
    | "total-solar"
    | "annular-solar"
    | "hybrid-solar"
    | "partial-solar"
    | "total-lunar"
    | "partial-lunar"
    | "penumbral-lunar";
  /** NASA's compact region descriptor. */
  region: string;
}

/**
 * Upcoming eclipses (greatest-eclipse date in UTC). Curated on
 * 2026-05-03 from the NASA decade tables, covering ~10 years
 * through Aug 2036. Sorted strictly chronologically so
 * `nextEclipse()` can short-circuit on the first match.
 *
 * MAINTENANCE: when the tail starts running short — say, by 2034 —
 * extend the array with future events from
 * `eclipse.gsfc.nasa.gov/SEdecade` and `eclipse.gsfc.nasa.gov/LEdecade`.
 * After the last cataloged event passes, the "Upcoming event" strip
 * on the dashboard simply stops rendering (no fallback copy), so
 * letting the catalog expire silently degrades the UX rather than
 * breaking it.
 */
export const ECLIPSES: EclipseEvent[] = [
  {
    date: "2026-08-12",
    kind: "solar",
    type: "total-solar",
    region: "Arctic, Greenland, Iceland, Spain, W. Africa, Europe",
  },
  {
    date: "2026-08-28",
    kind: "lunar",
    type: "partial-lunar",
    region: "E. Pacific, Americas, Europe, Africa",
  },
  {
    date: "2027-02-06",
    kind: "solar",
    type: "annular-solar",
    region: "Chile, Argentina, Atlantic, S. Africa, Antarctica",
  },
  {
    date: "2027-02-20",
    kind: "lunar",
    type: "penumbral-lunar",
    region: "Americas, Europe, Africa, Asia",
  },
  {
    date: "2027-07-18",
    kind: "lunar",
    type: "penumbral-lunar",
    region: "E. Africa, Asia, Australia, Pacific",
  },
  {
    date: "2027-08-02",
    kind: "solar",
    type: "total-solar",
    region: "Morocco, Spain, Algeria, Libya, Egypt, Saudi Arabia, Yemen, Somalia",
  },
  {
    date: "2027-08-17",
    kind: "lunar",
    type: "penumbral-lunar",
    region: "Pacific, Americas",
  },
  {
    date: "2028-01-12",
    kind: "lunar",
    type: "partial-lunar",
    region: "Americas, Europe, Africa",
  },
  {
    date: "2028-01-26",
    kind: "solar",
    type: "annular-solar",
    region: "Ecuador, Peru, Brazil, Suriname, Spain, Portugal",
  },
  {
    date: "2028-07-06",
    kind: "lunar",
    type: "partial-lunar",
    region: "Europe, Africa, Asia, Australia",
  },
  {
    date: "2028-07-22",
    kind: "solar",
    type: "total-solar",
    region: "Australia, New Zealand, SE Asia, E. Indies",
  },
  {
    date: "2028-12-31",
    kind: "lunar",
    type: "total-lunar",
    region: "Europe, Africa, Asia, Australia, Pacific",
  },
  {
    date: "2029-01-14",
    kind: "solar",
    type: "partial-solar",
    region: "N. America, C. America",
  },
  {
    date: "2029-06-12",
    kind: "solar",
    type: "partial-solar",
    region: "Arctic, Scandinavia, Alaska, N. Asia, N. Canada",
  },
  {
    date: "2029-06-26",
    kind: "lunar",
    type: "total-lunar",
    region: "Americas, Europe, Africa, Mid-East",
  },
  {
    date: "2029-07-11",
    kind: "solar",
    type: "partial-solar",
    region: "S. Chile, S. Argentina",
  },
  {
    date: "2029-12-05",
    kind: "solar",
    type: "partial-solar",
    region: "S. Argentina, S. Chile, Antarctica",
  },
  {
    date: "2029-12-20",
    kind: "lunar",
    type: "total-lunar",
    region: "Americas, Europe, Africa, Asia",
  },
  {
    date: "2030-06-01",
    kind: "solar",
    type: "annular-solar",
    region: "Algeria, Tunisia, Greece, Turkey, Russia, N. China, Japan",
  },
  {
    date: "2030-06-15",
    kind: "lunar",
    type: "partial-lunar",
    region: "Europe, Africa, Asia, Australia",
  },
  {
    date: "2030-11-25",
    kind: "solar",
    type: "total-solar",
    region: "Botswana, S. Africa, Australia",
  },
  {
    date: "2030-12-09",
    kind: "lunar",
    type: "penumbral-lunar",
    region: "Americas, Europe, Africa, Asia",
  },
  {
    date: "2031-05-07",
    kind: "lunar",
    type: "penumbral-lunar",
    region: "Americas, Europe, Africa",
  },
  {
    date: "2031-05-21",
    kind: "solar",
    type: "annular-solar",
    region: "Africa, S. Asia, E. Indies, Australia",
  },
  {
    date: "2031-06-05",
    kind: "lunar",
    type: "penumbral-lunar",
    region: "E. Indies, Australia, Pacific",
  },
  {
    date: "2031-10-30",
    kind: "lunar",
    type: "penumbral-lunar",
    region: "Americas",
  },
  {
    date: "2031-11-14",
    kind: "solar",
    type: "hybrid-solar",
    region: "Pacific, S. US, C. America, NW. South America",
  },
  {
    date: "2032-04-25",
    kind: "lunar",
    type: "total-lunar",
    region: "E. Africa, Asia, Australia, Pacific",
  },
  {
    date: "2032-05-09",
    kind: "solar",
    type: "annular-solar",
    region: "S. South America, S. Africa",
  },
  {
    date: "2032-10-18",
    kind: "lunar",
    type: "total-lunar",
    region: "Africa, Europe, Asia, Australia",
  },
  {
    date: "2032-11-03",
    kind: "solar",
    type: "partial-solar",
    region: "Asia",
  },
  {
    date: "2033-03-30",
    kind: "solar",
    type: "total-solar",
    region: "N. America",
  },
  {
    date: "2033-04-14",
    kind: "lunar",
    type: "total-lunar",
    region: "Europe, Africa, Asia, Australia",
  },
  {
    date: "2033-09-23",
    kind: "solar",
    type: "partial-solar",
    region: "S. South America, Antarctica",
  },
  {
    date: "2033-10-08",
    kind: "lunar",
    type: "total-lunar",
    region: "Asia, Australia, Pacific, Americas",
  },
  {
    date: "2034-03-20",
    kind: "solar",
    type: "total-solar",
    region: "Africa, Europe, W. Asia",
  },
  {
    date: "2034-04-03",
    kind: "lunar",
    type: "penumbral-lunar",
    region: "Europe, Africa, Asia, Australia",
  },
  {
    date: "2034-09-12",
    kind: "solar",
    type: "annular-solar",
    region: "C. America, S. America",
  },
  {
    date: "2034-09-28",
    kind: "lunar",
    type: "partial-lunar",
    region: "Americas, Europe, Africa",
  },
  {
    date: "2035-02-22",
    kind: "lunar",
    type: "penumbral-lunar",
    region: "E. Asia, Pacific, Americas",
  },
  {
    date: "2035-03-09",
    kind: "solar",
    type: "annular-solar",
    region: "Australia, New Zealand, S. Pacific, Mexico, Antarctica",
  },
  {
    date: "2035-08-19",
    kind: "lunar",
    type: "partial-lunar",
    region: "Americas, Europe, Africa, Mid-East",
  },
  {
    date: "2035-09-02",
    kind: "solar",
    type: "total-solar",
    region: "E. Asia, Pacific",
  },
  {
    date: "2036-02-11",
    kind: "lunar",
    type: "total-lunar",
    region: "Americas, Europe, Africa, Asia, W. Australia",
  },
  {
    date: "2036-02-27",
    kind: "solar",
    type: "partial-solar",
    region: "Antarctica, S. Australia, New Zealand",
  },
  {
    date: "2036-08-07",
    kind: "lunar",
    type: "total-lunar",
    region: "Americas, Europe, Africa, W. Asia",
  },
];

/**
 * Return the next eclipse on or after `from`'s station-local calendar
 * day, or null if none cataloged.
 *
 * Both the catalog dates and `from` are reduced to a YYYY-MM-DD
 * calendar day in the station's timezone, then compared as strings.
 * This keeps an eclipse visible for the entire local day on which
 * it occurs, regardless of when greatest-eclipse actually falls in
 * UTC. The previous implementation anchored events at UTC noon and
 * compared epoch ms, which (a) hid an eclipse from western timezones
 * once local noon passed UTC noon — even though the eclipse was still
 * the same calendar day locally — and (b) could shift the day
 * boundary by ±1 in far-eastern timezones.
 *
 * Limitation: the catalog uses NASA's UTC date for the event. For
 * stations far from UTC (e.g., Tokyo, UTC+9), an eclipse's local
 * calendar day can differ from its UTC calendar day by ±1. Surfaces
 * cleanly for the majority of timezones; misalignment in extreme
 * cases is at most a single day and would require per-event UTC
 * times in the dataset to resolve.
 */
export function nextEclipse(from: Date, tz: string): EclipseEvent | null {
  // "en-CA" yields a YYYY-MM-DD format directly usable for ISO
  // calendar-string comparison against the dataset's `date` field.
  const todayYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(from);
  for (const e of ECLIPSES) {
    if (e.date >= todayYmd) return e;
  }
  return null;
}

/** Compact human-readable type label (e.g. "Total solar"). */
export function eclipseTypeLabel(type: EclipseEvent["type"]): string {
  switch (type) {
    case "total-solar":
      return "Total solar";
    case "annular-solar":
      return "Annular solar";
    case "hybrid-solar":
      return "Hybrid solar";
    case "partial-solar":
      return "Partial solar";
    case "total-lunar":
      return "Total lunar";
    case "partial-lunar":
      return "Partial lunar";
    case "penumbral-lunar":
      return "Penumbral lunar";
  }
}
