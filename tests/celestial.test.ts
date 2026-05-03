import { describe, it, expect } from "vitest";
import {
  daylightDeltaMs,
  nextMoonPhase,
  nextSolstice,
} from "@/lib/astronomy/celestial";
// `moonPhaseName` lives in `horizon.ts` (the only UI consumers — see
// `HorizonBand` and `HorizonBandCelestial` — import from there). A
// previous duplicate copy in `celestial.ts` rendered Title Case while
// the canonical version returns lowercase; deleting the duplicate
// removed the footgun, so the test now exercises the real function.
import { moonPhaseName } from "@/lib/astronomy/horizon";
import { nextEclipse, eclipseTypeLabel } from "@/lib/astronomy/eclipses";

const PHX = { lat: 33.4484, lon: -112.074 };

describe("daylightDeltaMs", () => {
  it("is positive in the spring (days getting longer)", () => {
    // Phoenix mid-April: a few hundred ms to a couple minutes longer
    // each day, depending on date. Just assert sign.
    const aprilDay = new Date("2026-04-15T12:00:00-07:00");
    const delta = daylightDeltaMs(aprilDay, PHX.lat, PHX.lon);
    expect(delta).not.toBeNull();
    expect(delta!).toBeGreaterThan(0);
  });

  it("is negative in the fall (days getting shorter)", () => {
    const octDay = new Date("2026-10-15T12:00:00-07:00");
    const delta = daylightDeltaMs(octDay, PHX.lat, PHX.lon);
    expect(delta).not.toBeNull();
    expect(delta!).toBeLessThan(0);
  });

  it("is small near the solstices", () => {
    const juneSolstice = new Date("2026-06-21T12:00:00-07:00");
    const delta = daylightDeltaMs(juneSolstice, PHX.lat, PHX.lon);
    // Around solstices day-length changes by < 30s/day.
    expect(Math.abs(delta!)).toBeLessThan(30_000);
  });
});

describe("nextMoonPhase", () => {
  it("returns a date strictly in the future", () => {
    const now = new Date("2026-04-25T12:00:00Z");
    const full = nextMoonPhase(now, "full");
    const newM = nextMoonPhase(now, "new");
    expect(full).not.toBeNull();
    expect(newM).not.toBeNull();
    expect(full!.getTime()).toBeGreaterThan(now.getTime());
    expect(newM!.getTime()).toBeGreaterThan(now.getTime());
  });

  it("returns dates within ~one synodic month (29.5d)", () => {
    const now = new Date("2026-04-25T12:00:00Z");
    const full = nextMoonPhase(now, "full");
    const newM = nextMoonPhase(now, "new");
    const synodicMs = 30 * 86_400_000;
    expect(full!.getTime() - now.getTime()).toBeLessThan(synodicMs);
    expect(newM!.getTime() - now.getTime()).toBeLessThan(synodicMs);
  });

  it("alternates: next full and next new are roughly half a synodic month apart", () => {
    const now = new Date("2026-04-25T12:00:00Z");
    const full = nextMoonPhase(now, "full");
    const newM = nextMoonPhase(now, "new");
    const halfSynodicMs = 14.7 * 86_400_000;
    const diff = Math.abs(full!.getTime() - newM!.getTime());
    // Allow ±2 days slack.
    expect(diff).toBeGreaterThan(halfSynodicMs - 2 * 86_400_000);
    expect(diff).toBeLessThan(halfSynodicMs + 2 * 86_400_000);
  });
});

describe("nextSolstice", () => {
  it("returns June 2026 solstice from late April 2026", () => {
    const now = new Date("2026-04-25T12:00:00Z");
    const sol = nextSolstice(now);
    expect(sol).not.toBeNull();
    expect(sol!.kind).toBe("summer");
    expect(sol!.date.getUTCMonth()).toBe(5); // June (0-indexed)
    expect(sol!.date.getUTCFullYear()).toBe(2026);
  });

  it("rolls forward to next year's June solstice from late June 2026", () => {
    const now = new Date("2026-06-25T12:00:00Z");
    const sol = nextSolstice(now);
    // After the June solstice, the next solstice is December (winter).
    expect(sol!.kind).toBe("winter");
    expect(sol!.date.getUTCFullYear()).toBe(2026);
  });

  it("returns next-year's June from December", () => {
    const now = new Date("2026-12-25T12:00:00Z");
    const sol = nextSolstice(now);
    expect(sol!.kind).toBe("summer");
    expect(sol!.date.getUTCFullYear()).toBe(2027);
  });
});

describe("moonPhaseName", () => {
  it("names canonical phases", () => {
    expect(moonPhaseName(0)).toBe("New moon");
    expect(moonPhaseName(0.25)).toBe("First quarter");
    expect(moonPhaseName(0.5)).toBe("Full moon");
    expect(moonPhaseName(0.75)).toBe("Last quarter");
    expect(moonPhaseName(0.99)).toBe("New moon");
  });
});

describe("nextEclipse", () => {
  it("returns the first eclipse strictly after `from`", () => {
    const before = new Date("2026-04-25T12:00:00Z");
    const e = nextEclipse(before);
    expect(e).not.toBeNull();
    expect(Date.parse(`${e!.date}T12:00:00Z`)).toBeGreaterThan(before.getTime());
  });

  it("skips eclipses on the same calendar day (anchor at noon UTC)", () => {
    // First cataloged eclipse is 2026-08-12. From midnight that day,
    // we should still get *that* eclipse (noon anchor is later than
    // midnight). From late on 2026-08-12, we should skip ahead.
    const earlyOnDay = new Date("2026-08-12T00:00:00Z");
    const lateOnDay = new Date("2026-08-12T18:00:00Z");
    expect(nextEclipse(earlyOnDay)?.date).toBe("2026-08-12");
    expect(nextEclipse(lateOnDay)?.date).not.toBe("2026-08-12");
  });
});

describe("eclipseTypeLabel", () => {
  it("formats every type cleanly", () => {
    expect(eclipseTypeLabel("total-solar")).toBe("Total solar");
    expect(eclipseTypeLabel("annular-solar")).toBe("Annular solar");
    expect(eclipseTypeLabel("partial-lunar")).toBe("Partial lunar");
    expect(eclipseTypeLabel("penumbral-lunar")).toBe("Penumbral lunar");
  });
});
