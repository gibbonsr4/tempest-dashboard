import { describe, it, expect } from "vitest";
import { ytdDays } from "@/components/history/RangePicker";

/**
 * `ytdDays` returns the user-facing day count for the History tab's
 * YTD button. It must NOT clamp to the 181-day API floor — that floor
 * is applied separately at fetch time. Returning the truthful count
 * is what lets the YTD chart render the actual year-to-date window
 * (e.g. 122 days on May 2) instead of mislabelling 181 days of late-
 * prior-year + current-year data as "year to date."
 */
describe("ytdDays", () => {
  // All `nowMs` values below are constructed from `new Date(...).getTime()`
  // for readability. The function takes a tz arg so the year boundary
  // anchors at station-local Jan 1, regardless of the viewer's tz.

  // The fixture tz (`Pacific/Honolulu`, UTC-10) is just a stable test
  // anchor — any non-DST timezone would work. The expected day
  // counts below assume the fixture's offset.

  it("returns 5 on Jan 5 in the UTC-10 fixture", () => {
    // Jan 5 22:00 UTC = noon in the fixture zone.
    // Year start (Jan 1 00:00 fixture-local) = Jan 1 10:00 UTC.
    // Diff: 4 days 12 hours → ceil = 5.
    const nowMs = new Date("2026-01-05T22:00:00Z").getTime();
    expect(ytdDays("Pacific/Honolulu", nowMs)).toBe(5);
  });

  it("returns 122 on May 2 in the UTC-10 fixture", () => {
    // Regression: previously this returned 181 because the function
    // clamped at the API floor — i.e., on May 2 the chart silently
    // showed 181 days of data labelled "YTD" instead of the actual
    // 122 days from Jan 1 forward.
    const nowMs = new Date("2026-05-02T22:00:00Z").getTime();
    expect(ytdDays("Pacific/Honolulu", nowMs)).toBe(122);
  });

  it("returns 364 on Dec 30 in the UTC-10 fixture", () => {
    const nowMs = new Date("2026-12-30T22:00:00Z").getTime();
    expect(ytdDays("Pacific/Honolulu", nowMs)).toBe(364);
  });

  it("anchors the year start to the station tz, not the viewer's", () => {
    // Dec 31 2026 23:00 in the fixture tz (UTC-10) = Jan 1 2027
    // 09:00 UTC. The station-anchored year string is "2026", so YTD
    // resolves to ~365, not ~1 — proving the function uses the
    // STATION's calendar boundary, not whatever the viewer's tz is.
    const nowMs = new Date("2027-01-01T09:00:00Z").getTime();
    const days = ytdDays("Pacific/Honolulu", nowMs);
    expect(days).toBeGreaterThanOrEqual(364);
    expect(days).toBeLessThanOrEqual(366);
  });

  it("returns 1, not 0, on Jan 1 morning in a positive-offset tz", () => {
    // Regression: the previous UTC-noon anchor made YTD return 0 (or
    // negative-clamped-to-0) for stations east of UTC at any moment
    // on Jan 1 before 12:00 UTC, because nowMs was BEFORE the
    // anchor. Sydney 8 AM AEDT on Jan 1 = Dec 31 21:00 UTC of the
    // prior year. With the station-local-midnight anchor, YTD is
    // 1 (the user is meaningfully into "this year").
    const nowMs = new Date("2025-12-31T21:00:00Z").getTime();
    const days = ytdDays("Australia/Sydney", nowMs);
    expect(days).toBe(1);
  });
});
