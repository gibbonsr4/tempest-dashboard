/**
 * Curated upcoming eclipses, sourced from NASA's Five Millennium
 * Catalog of Solar Eclipses (eclipse.gsfc.nasa.gov/SEcat5/) and the
 * companion lunar catalog. Refresh annually — there are 2-5 of each
 * kind per year so this list will need extending periodically.
 *
 * Approach: instead of computing eclipses from ephemeris (a
 * non-trivial pile of code, ~500 KB if we pull a library), we ship
 * a tiny static dataset and a "next event after `from`" lookup.
 * Region strings come straight from NASA's path descriptors so users
 * can read at a glance whether their station's region applies. We
 * deliberately don't compute path-of-totality membership for the
 * specific station lat/lon — that's a future enhancement if it
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
 * Upcoming eclipses (greatest-eclipse date in UTC). Refresh me from
 * NASA tables as years roll forward — current list curated on
 * 2026-04-25 covering the next ~3 years.
 */
export const ECLIPSES: EclipseEvent[] = [
  {
    date: "2026-08-12",
    kind: "solar",
    type: "total-solar",
    region: "Greenland, Iceland, N. Atlantic, Spain, Russia",
  },
  {
    date: "2026-08-28",
    kind: "lunar",
    type: "partial-lunar",
    region: "Pacific, Americas, Europe, Africa",
  },
  {
    date: "2027-02-06",
    kind: "solar",
    type: "annular-solar",
    region: "Pacific, S. America, Atlantic, S. Africa",
  },
  {
    date: "2027-02-20",
    kind: "lunar",
    type: "penumbral-lunar",
    region: "Africa, Europe, Asia, Australia",
  },
  {
    date: "2027-08-02",
    kind: "solar",
    type: "total-solar",
    region: "S. Europe, N. Africa, Mid-East, India",
  },
  {
    date: "2027-08-17",
    kind: "lunar",
    type: "penumbral-lunar",
    region: "Europe, Africa, Asia, Australia",
  },
  {
    date: "2028-01-12",
    kind: "lunar",
    type: "partial-lunar",
    region: "Americas, Pacific, Africa, Europe",
  },
  {
    date: "2028-01-26",
    kind: "solar",
    type: "annular-solar",
    region: "S. America, Atlantic, W. Africa, Europe",
  },
  {
    date: "2028-07-06",
    kind: "lunar",
    type: "partial-lunar",
    region: "Pacific, Americas",
  },
  {
    date: "2028-07-22",
    kind: "solar",
    type: "total-solar",
    region: "Indian Ocean, Australia, New Zealand",
  },
  {
    date: "2028-12-31",
    kind: "lunar",
    type: "total-lunar",
    region: "Europe, Africa, Asia, Australia",
  },
  {
    date: "2029-06-12",
    kind: "solar",
    type: "partial-solar",
    region: "Arctic, N. America, Europe",
  },
  {
    date: "2029-06-26",
    kind: "lunar",
    type: "total-lunar",
    region: "Africa, Europe, Asia, Australia, Antarctic",
  },
];

/** Return the next eclipse strictly after `from`, or null if none cataloged. */
export function nextEclipse(from: Date): EclipseEvent | null {
  const fromMs = from.getTime();
  for (const e of ECLIPSES) {
    // Anchor each event at noon UTC of the `date` so equality on the
    // event's day still treats it as "today" rather than "in the past".
    const eventMs = Date.parse(`${e.date}T12:00:00Z`);
    if (eventMs > fromMs) return e;
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
