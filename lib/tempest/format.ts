/**
 * Time-zone-aware formatters. The dashboard renders every timestamp
 * in its station's local zone, which is read at runtime from the
 * Tempest API (`useStationMeta().timezone`). Components access the
 * resolved zone via `useStationTz()` and pass it explicitly to every
 * formatter — there is no module-level default tz, deliberately.
 *
 * Why no default: this dashboard ships as a public, self-hostable
 * repo. A hardcoded default IANA tz would only ever be correct for
 * one specific station; for everyone else it would silently render
 * timestamps in the wrong zone. Requiring `tz` at every call site
 * forces every code path to be tz-aware.
 */

import { formatInTimeZone, getTimezoneOffset } from "date-fns-tz";

const toDate = (d: Date | number): Date =>
  typeof d === "number" ? new Date(d) : d;

/** "3:42 PM" */
export const formatClock = (d: Date | number, tz: string): string =>
  formatInTimeZone(toDate(d), tz, "h:mm a");

/** "Mon Apr 24" */
export const formatDateShort = (d: Date | number, tz: string): string =>
  formatInTimeZone(toDate(d), tz, "EEE MMM d");

/** "Apr 24" */
export const formatMonthDay = (d: Date | number, tz: string): string =>
  formatInTimeZone(toDate(d), tz, "MMM d");

/** "Mon" */
export const formatWeekday = (d: Date | number, tz: string): string =>
  formatInTimeZone(toDate(d), tz, "EEE");

/** "Mon 4:00 PM" — used by AlertsBanner for alert-expiration timestamps. */
export const formatClockWithDay = (d: Date | number, tz: string): string =>
  formatInTimeZone(toDate(d), tz, "EEE h:mm a");

/**
 * Epoch ms at the start of the station-local day containing `ms`.
 *
 * Implementation note: we derive the offset at the candidate instant
 * via date-fns-tz's `getTimezoneOffset`, which handles DST automatically.
 * A hardcoded numeric offset (e.g. `-07:00`) is fine for non-DST zones
 * but quietly wrong for any zone that observes DST. This is the entire
 * reason the tz argument is required across this module.
 */
export function startOfStationDay(ms: number, tz: string): number {
  const ymd = formatInTimeZone(new Date(ms), tz, "yyyy-MM-dd");
  // Step 1: the same Y/M/D interpreted as midnight UTC (a fake instant
  // that's roughly the same day, used only to look up the offset).
  const fakeUtcMidnight = Date.parse(`${ymd}T00:00:00.000Z`);
  // Step 2: the station's offset at that instant (ms east of UTC).
  const offsetMs = getTimezoneOffset(tz, new Date(fakeUtcMidnight));
  // Step 3: actual local midnight = fakeUtcMidnight − offset.
  // (e.g. for a UTC-7 zone, offset = −25_200_000; fakeUtc minus that
  // negative number lands at 07:00 UTC, which is 00:00 in the local
  // zone — exactly what we want.)
  return fakeUtcMidnight - offsetMs;
}

/**
 * Relative time, in plain English, suitable for "last strike 14 min ago"
 * or "updated just now". Always returns past tense (used for events that
 * already happened). Resolution: seconds → minutes → hours → days.
 *
 * Doesn't take a tz — relative durations are tz-agnostic.
 */
export function formatRelative(
  then: Date | number,
  now: Date | number = Date.now(),
): string {
  const t = typeof then === "number" ? then : then.getTime();
  const n = typeof now === "number" ? now : now.getTime();
  const diff = Math.max(0, n - t);
  const s = Math.round(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/**
 * "5h 14m" — used for daylight-remaining countdowns and uptime strings.
 * Drops zero-valued leading units, never reads "0h 5m".
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return "0m";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}
