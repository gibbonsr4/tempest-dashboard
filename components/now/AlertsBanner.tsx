"use client";

import * as React from "react";
import { AlertTriangle, ChevronDown, ExternalLink } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatClockWithDay } from "@/lib/tempest/format";
import { useStationTz } from "@/lib/tempest/tz-context";
import { sortAlertsBySeverity } from "@/lib/nws/sort";
import type { AlertsFeatureCollection } from "@/lib/nws/schemas";

/**
 * Banner shown only when one or more NWS alerts are active for the
 * station's lat/lon. The headline (and the border tone) come from
 * the most-urgent alert, picked via `sortAlertsBySeverity` so a
 * multi-alert day always promotes the worst event regardless of
 * NWS's wire order.
 *
 *   Banner tones (two-tier — every active alert is colored, never
 *   muted, since an "Unknown"-severity alert is still actionable):
 *     Extreme | Severe → destructive
 *     anything else    → primary (copper)
 *
 *   The expanded list's `<SeverityChip />` carries the per-row
 *   three-tier gradation (destructive / primary / muted) when it
 *   matters at finer granularity than the banner can show.
 *
 * Multiple alerts collapse into an expandable list, sorted in the
 * same order as the headline pick.
 */
export function AlertsBanner({
  alerts,
  latitude,
  longitude,
}: {
  alerts: AlertsFeatureCollection | undefined;
  /** Station lat/lon — used to build the public-facing NWS forecast
   *  link. Each alert in the response has a `feature.id` URL, but
   *  that's the api.weather.gov JSON endpoint (machine-readable
   *  only). The forecast.weather.gov MapClick URL renders the user's
   *  local NWS forecast page with active alerts highlighted at the
   *  top — what a user actually wants when they click "View on NWS." */
  latitude?: number;
  longitude?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const tz = useStationTz();
  const reduce = useReducedMotion();
  // `useId` must run on every render — hoisting it above the
  // early return keeps the hook count stable, even when there are
  // no active alerts and the panel never mounts.
  const panelId = React.useId();

  const sorted = React.useMemo(
    () => (alerts?.features ? sortAlertsBySeverity(alerts.features) : []),
    [alerts],
  );

  if (sorted.length === 0) return null;

  // Public-facing NWS forecast URL for the station's location. All
  // alerts in this banner share the same destination because
  // they're all active for the user's lat/lon — the MapClick page
  // surfaces every active alert for that point + the regular
  // forecast. Falls back to NWS home if coords aren't provided
  // (shouldn't happen in practice — the alerts API was queried with
  // these coords to begin with).
  const nwsUrl =
    latitude != null && longitude != null
      ? `https://forecast.weather.gov/MapClick.php?lat=${latitude.toFixed(4)}&lon=${longitude.toFixed(4)}`
      : "https://forecast.weather.gov/";

  const top = sorted[0];
  const event = top.properties.event;
  // Guard parse — `new Date(<malformed>)` happily returns an
  // `Invalid Date` whose `.getTime()` is NaN, which then renders as
  // garbage downstream. NWS very occasionally emits empty/truncated
  // expires strings, so use Date.parse + Number.isFinite to fall
  // through to "no expiry shown" cleanly.
  const expiresMs = top.properties.expires
    ? Date.parse(top.properties.expires)
    : NaN;
  const expires = Number.isFinite(expiresMs) ? new Date(expiresMs) : null;
  const severity = (top.properties.severity ?? "").toLowerCase();

  // Two-tier banner tone — the banner itself always reads as an
  // alert (an "Unknown"-severity Air Quality Alert is still
  // actionable, and shouldn't blend in with regular cards), with
  // destructive reserved for the genuinely urgent tier. The
  // expanded list's per-row severity chip carries the finer
  // gradation when it matters. Border alpha is /80 — the minimum
  // tier that clears WCAG AA's 3:1 non-text contrast against both
  // light + dark page backgrounds (worst case ~3.14:1, vs ~2.3:1
  // at /60). Text on the alpha-blended bg measures 14:1+ in every
  // theme/tier, well clear of AA body text (4.5:1).
  const tone =
    severity === "extreme" || severity === "severe"
      ? "border-destructive/80 bg-destructive/15 text-foreground"
      : "border-primary/80 bg-primary/10 text-foreground";

  return (
    <section className={cn("rounded-xl border px-4 py-3", tone)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 rounded-md text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/70"
      >
        <div className="flex min-w-0 items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {/* Live region scoped to the headline only — it announces
              when the most-urgent event changes (e.g., a new alert
              promotes itself), without re-announcing the whole
              expanded list every time the user toggles the
              chevron. */}
          <span aria-live="polite" className="truncate text-sm font-medium">
            {event}
          </span>
          {expires && (
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              · until {formatClockWithDay(expires, tz)}
            </span>
          )}
          {sorted.length > 1 && (
            <span className="ml-2 shrink-0 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              +{sorted.length - 1} more
            </span>
          )}
        </div>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            id={panelId}
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : { type: "spring", stiffness: 280, damping: 32 }
            }
            className="space-y-3 overflow-hidden pt-3"
          >
            {sorted.map((f, i) => (
              <li key={f.id ?? i} className="space-y-1">
                {/* Headline row: text on the left, severity chip on
                    the right edge. Two-row layout (this row + the
                    region/link row below) reads as a tidy table
                    instead of a stacked action-group that pushes
                    the area description down.
                    Mobile chip placement: the chip flows INLINE at
                    the end of the headline text instead of dropping
                    to its own line. A small standalone pill stranded
                    on its own line under a long-text headline reads
                    as orphaned; an inline pill at the end of the
                    text reads as a natural meta-marker. The desktop
                    chip is rendered as a separate flex child so
                    `justify-between` pins it to the right edge. */}
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  {/* Headline is the primary readable text — it
                      already starts with the event name ("Air Quality
                      Alert issued May 1 at 9:28 AM …"), so we use it
                      verbatim and skip the standalone event-name row
                      that would duplicate the collapsed banner's
                      title. Falls back to `event` for the rare case
                      where NWS omits a headline. */}
                  <span className="min-w-0 flex-1 break-words text-sm">
                    {f.properties.headline ?? f.properties.event}
                    {/* Inline (mobile-only) chip — follows the headline
                        text, wraps with it. Hidden at sm+ in favor of
                        the right-edge instance below. */}
                    <span className="ml-2 sm:hidden">
                      <SeverityChip severity={f.properties.severity} />
                    </span>
                  </span>
                  {/* Right-edge (desktop) chip — sits at the end of
                      the flex row at sm+ via the parent's
                      justify-between. Hidden on mobile. */}
                  <span className="hidden shrink-0 sm:inline-flex">
                    <SeverityChip severity={f.properties.severity} />
                  </span>
                </div>
                {/* Region row: areaDesc on the left, "View on NWS"
                    link inline on the right. The link's URL is
                    constructed once at the banner level from the
                    station's coords (`feature.id` would have been
                    the obvious choice but it points at
                    api.weather.gov's JSON endpoint, which renders
                    as raw JSON in a browser — not what a user
                    clicking "View on NWS" expects). All alerts
                    share the same MapClick URL because they're all
                    active for the same lat/lon; the destination
                    page surfaces every active alert at the top
                    plus the regular forecast for context. */}
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                  {f.properties.areaDesc && (
                    <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                      {f.properties.areaDesc}
                    </div>
                  )}
                  <a
                    href={nwsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground sm:ml-auto"
                  >
                    View on NWS
                    <ExternalLink className="size-3" aria-hidden />
                    <span className="sr-only"> (opens in new tab)</span>
                  </a>
                </div>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}

/**
 * Compact severity badge that color-codes the alert by its NWS-reported
 * severity. Mirrors the banner's tone scheme so a glance lines the
 * chip up with the surrounding banner color: destructive for
 * Severe / Extreme, primary (copper) for Moderate, muted for Minor /
 * Unknown. Hidden only when severity is missing entirely (NWS does
 * sometimes omit the field for non-classified events).
 *
 * Color-cue rules:
 *   - The chip's bg + border carry the severity tier.
 *   - Text always uses `foreground` (or `muted-foreground` for the
 *     minor tier), never the raw `destructive` red — that combination
 *     bottoms out at ~3:1 against the alpha-blended chip bg, which
 *     fails WCAG AA body text (4.5:1). Foreground on these bgs lands
 *     ≥11:1 in every theme/tier.
 *   - Borders use /90 (destructive, moderate) and `foreground/50`
 *     (minor) so they clear AA's 3:1 non-text contrast against both
 *     banner tier backgrounds. The `border` token at any alpha can't
 *     reach 3:1 against the muted/destructive/primary banner bg
 *     blends — that's why the minor tier reaches for `foreground/50`.
 */
function SeverityChip({ severity }: { severity: string | undefined }) {
  if (!severity) return null;
  const lower = severity.toLowerCase();
  const tone =
    lower === "extreme" || lower === "severe"
      ? "border-destructive/90 bg-destructive/15 text-foreground"
      : lower === "moderate"
        ? "border-primary/90 bg-primary/10 text-foreground"
        : "border-foreground/50 bg-muted/50 text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        tone,
      )}
    >
      {severity}
    </span>
  );
}
