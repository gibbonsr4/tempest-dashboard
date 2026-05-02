"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { horizonForDay } from "@/lib/astronomy/horizon";
import { moonPhaseName } from "@/lib/astronomy/horizon";
import {
  eclipseTypeLabel,
  type EclipseEvent,
} from "@/lib/astronomy/eclipses";
import {
  formatClock,
  formatDuration,
  formatMonthDay,
  startOfStationDay,
} from "@/lib/tempest/format";
import { StatTile } from "@/components/shared/StatTile";
import { SubtitleMoon } from "./HorizonBandGlyphs";

/**
 * Expanded "celestial details" panel rendered below the HorizonBand
 * subtitle when the user opens the disclosure. Two-column layout
 * (Sun / Moon) with hero stats + a grid of mini tiles per column,
 * plus an Eclipse strip when there's a future eclipse.
 *
 * Solstice events live in the Sun column and full/new moon events
 * live in the Moon column rather than a separate "Upcoming" list —
 * keeping milestone events grouped with the body they orbit
 * (mentally) is more scannable. Eclipse gets its own full-width
 * strip because it's compound (date + region + type) and
 * location-conditional, which doesn't fit the daily-cadence pattern
 * of the other tiles.
 *
 * Date + day-distance math is centralized in `daysUntil` /
 * `stationLocalDayMs`, both station-tz aware via `startOfStationDay`
 * so DST transitions don't shift "today / tomorrow" by an hour.
 */

export type CelestialDetail = {
  daylightMs: number | null;
  deltaMs: number | null;
  nextFull: Date | null;
  nextNew: Date | null;
  nextSol: { date: Date; kind: "summer" | "winter" } | null;
  nextEcl: EclipseEvent | null;
};

export type AlertState = { alert: boolean; label: string };

/**
 * Determine the disclosure label and alert color based on what
 * celestial event is coming up next. Priority order surfaces the
 * most "punchy" / time-sensitive event:
 *   1. Eclipse within 14 days (rare, time-bounded, often visible)
 *   2. Solstice today / tomorrow
 *   3. Full moon today
 *   4. New moon today
 *   5. otherwise: muted "More details"
 *
 * The day-boundary checks are tz-aware (`startOfStationDay`) so a
 * full moon at 11:30 PM local still counts as "today" / "tonight".
 */
export function computeAlertState(
  nowMs: number,
  tz: string,
  detail: CelestialDetail,
): AlertState {
  // Station-day boundaries derived through `startOfStationDay`, which
  // resolves the IANA tz at each instant — so DST transitions don't
  // shift "today" / "tomorrow" by an hour. Adding 86_400_000ms to a
  // day boundary is wrong on the spring-forward day (the day is
  // 23 hours, not 24), so we compute each boundary independently.
  const todayStart = startOfStationDay(nowMs, tz);
  const tomorrowStart = startOfStationDay(nowMs + 86_400_000, tz);
  const dayAfterTomorrow = startOfStationDay(nowMs + 2 * 86_400_000, tz);
  const daysToMs = (target: number) => {
    // Whole-day distance, rounded by which station-day the target
    // lands in — same logic as `daysUntil` below, lifted here so the
    // alert label stays consistent with the eclipse-strip caption.
    const startTarget = startOfStationDay(target, tz);
    return Math.max(0, Math.round((startTarget - todayStart) / 86_400_000));
  };

  if (detail.nextEcl) {
    // Eclipse dates are calendar days (no time-of-day). Anchor at
    // station-local noon so the day distance reads cleanly across
    // any tz offset.
    const eclLocal = stationLocalDayMs(detail.nextEcl.date, tz);
    const days = daysToMs(eclLocal);
    if (days >= 0 && days <= 14) {
      const type = eclipseTypeLabel(detail.nextEcl.type);
      const label =
        days === 0
          ? `${type} eclipse today!`
          : days === 1
            ? `${type} eclipse tomorrow`
            : `${type} eclipse in ${days} days`;
      return { alert: true, label };
    }
  }

  if (detail.nextSol) {
    const solMs = detail.nextSol.date.getTime();
    if (solMs < dayAfterTomorrow) {
      const dayLabel = solMs < tomorrowStart ? "today" : "tomorrow";
      const kind =
        detail.nextSol.kind[0].toUpperCase() + detail.nextSol.kind.slice(1);
      return { alert: true, label: `${kind} solstice ${dayLabel}` };
    }
  }

  if (detail.nextFull && detail.nextFull.getTime() < tomorrowStart) {
    return { alert: true, label: "Full moon tonight" };
  }

  if (detail.nextNew && detail.nextNew.getTime() < tomorrowStart) {
    return { alert: true, label: "New moon today" };
  }

  return { alert: false, label: "More details" };
}

/**
 * Convert an eclipse calendar date (`yyyy-MM-dd`, no time-of-day) to
 * a milliseconds anchor at station-local noon for that date. We need
 * a tz-aware "this day, in the station's wall clock" point so that
 * day-distance math against `nowMs` reads naturally:
 *   - On Aug 11 station-local, "Aug 12 eclipse" → 1 day away
 *   - On Aug 12 station-local, "Aug 12 eclipse" → today
 *
 * Anchoring at noon avoids day-boundary edge cases on either side.
 */
function stationLocalDayMs(isoDate: string, tz: string): number {
  return startOfStationDay(
    new Date(`${isoDate}T12:00:00Z`).getTime(),
    tz,
  );
}

/**
 * Two-column expanded panel rendered below the band when the user
 * opens the disclosure. Each column has a hero stat + a grid of mini
 * tiles. Solstice lives with the sun, full/new moons with the moon —
 * keeping milestone events grouped with the body they orbit
 * (mentally) is more scannable than a separate "Upcoming" list.
 *
 * Eclipse gets its own full-width row at the bottom: it's a
 * compound (date + region + type), it's location-conditional
 * ("visible from Iceland"), and it doesn't fit the daily-cadence
 * mental model of the rest. Surfaced even when far in the future
 * because there are usually only ~2/year, so the next one is
 * intrinsically interesting.
 */
export function CelestialPanel({
  data,
  detail,
  moonriseLabel,
  moonsetLabel,
  tz,
  nowMs,
}: {
  data: ReturnType<typeof horizonForDay>;
  detail: CelestialDetail;
  moonriseLabel: string | null;
  moonsetLabel: string | null;
  tz: string;
  nowMs: number;
}) {
  const fmt = (ms: number | null) =>
    ms != null ? formatClock(ms, tz) : "—";

  return (
    <div className="border-t px-4 py-4 text-sm">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* SUN column */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Sun className="size-3.5" aria-hidden />
            Sun
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Daylight today
            </div>
            <div className="tabular text-2xl font-light leading-none mt-1">
              {detail.daylightMs != null
                ? formatDuration(detail.daylightMs)
                : "—"}
            </div>
            {detail.deltaMs != null && (
              <div className="text-xs text-muted-foreground mt-1 tabular">
                {formatDaylightDelta(detail.deltaMs)} vs yesterday
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Civil dawn" value={fmt(data.events.dawn)} />
            <StatTile label="Sunrise" value={fmt(data.events.sunrise)} />
            <StatTile label="Solar noon" value={fmt(data.events.solarNoon)} />
            <StatTile label="Sunset" value={fmt(data.events.sunset)} />
            <StatTile label="Civil dusk" value={fmt(data.events.dusk)} />
            {detail.nextSol && (
              <StatTile
                label={`Next ${detail.nextSol.kind}`}
                value={formatMonthDay(detail.nextSol.date, tz)}
                caption={`in ${daysUntil(nowMs, detail.nextSol.date, tz)}`}
              />
            )}
          </div>
        </div>

        {/* MOON column. Mirrors the Sun column's hero structure
            (uppercase label / large value / muted caption) so the
            tile rows below land at the same Y in both columns —
            previously the moon's label was inline with the glyph,
            which compressed the hero vertically and left the moon
            tiles riding higher than the sun tiles. */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Moon className="size-3.5" aria-hidden />
            Moon
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Phase
            </div>
            <div className="flex items-center gap-2 mt-1">
              <SubtitleMoon
                phase={data.moonPhase}
                fraction={data.moonFraction}
              />
              <span className="text-2xl font-light leading-none">
                {moonPhaseName(data.moonPhase)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1 tabular">
              {Math.round(data.moonFraction * 100)}% lit
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Moonrise" value={moonriseLabel ?? "—"} />
            <StatTile label="Moonset" value={moonsetLabel ?? "—"} />
            {detail.nextFull && (
              <StatTile
                label="Next full"
                value={formatMonthDay(detail.nextFull, tz)}
                caption={`in ${daysUntil(nowMs, detail.nextFull, tz)}`}
              />
            )}
            {detail.nextNew && (
              <StatTile
                label="Next new"
                value={formatMonthDay(detail.nextNew, tz)}
                caption={`in ${daysUntil(nowMs, detail.nextNew, tz)}`}
              />
            )}
          </div>
        </div>
      </div>

      {/* ECLIPSE section — always visible, full width. The labeled
          divider above it ("UPCOMING EVENT") provides a clear
          section break that prevents the strip from reading as a
          tail on the Moon column when the layout stacks on mobile. */}
      {detail.nextEcl && (
        <>
          <div className="mt-5 mb-3 flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Upcoming event
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <EclipseStrip event={detail.nextEcl} nowMs={nowMs} tz={tz} />
        </>
      )}
    </div>
  );
}

// `Tile` was a near-duplicate of `LightningTile` / `RainTile` —
// label / value / optional caption. Consolidated into `<StatTile>` in
// `components/shared/StatTile.tsx`. The local copy used `gap-1` while
// the others used `gap-1.5`; the shared version standardizes on
// `gap-1.5` (2px taller — visually unchanged for typical values).

function EclipseStrip({
  event,
  nowMs,
  tz,
}: {
  event: EclipseEvent;
  nowMs: number;
  tz: string;
}) {
  // Eclipse calendar dates are anchored at station-local noon for
  // consistent day-distance math (see `daysUntil` / `stationLocalDayMs`).
  const eventDate = new Date(`${event.date}T12:00:00Z`);
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Next eclipse
          </div>
          <div className="mt-1 text-base font-medium tabular">
            {eclipseTypeLabel(event.type)} · {shortMonthDay(event.date)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {event.region}
          </div>
        </div>
        <div className="shrink-0 text-xl font-light tabular text-primary">
          {daysUntil(nowMs, eventDate, tz)}
        </div>
      </div>
    </div>
  );
}

// ─── tiny formatters local to this card ─────────────────────────────

/**
 * Distance to a future date as a station-local calendar-day count.
 * Uses `startOfStationDay` on both ends so DST transitions don't
 * shift the count by an hour, and so `target - now` rounding doesn't
 * flip "today/1 day/2 days" near day boundaries (which the previous
 * `Math.round(diff / 86_400_000)` did intermittently).
 */
function daysUntil(nowMs: number, target: Date, tz: string): string {
  const todayStart = startOfStationDay(nowMs, tz);
  const targetStart = startOfStationDay(target.getTime(), tz);
  const days = Math.max(
    0,
    Math.round((targetStart - todayStart) / 86_400_000),
  );
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function shortMonthDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}

function formatDaylightDelta(deltaMs: number): string {
  const sign = deltaMs >= 0 ? "+" : "−";
  const absSec = Math.round(Math.abs(deltaMs) / 1000);
  const m = Math.floor(absSec / 60);
  const s = absSec % 60;
  return `${sign}${m > 0 ? `${m}m ${s}s` : `${s}s`}`;
}
