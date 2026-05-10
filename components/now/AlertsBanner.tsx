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
 *   matters at finer granularity than the banner can show. Chips
 *   are filled solid (token-paired bg + foreground) so they pop
 *   off the alpha-tinted banner regardless of banner tone.
 *
 * Multiple alerts collapse into an expandable list, sorted in the
 * same order as the headline pick. The collapsed header names the
 * additional events on a secondary line ("+ Air Quality Alert,
 * Tornado Watch") so the user sees what's stacked behind the
 * primary headline without having to expand.
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
        className="flex w-full flex-col gap-1 rounded-md text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/70"
      >
        <div className="flex w-full items-center justify-between gap-4">
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
          </div>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </div>
        {/* Secondary-alerts line for the multi-alert case. Names the
            additional events explicitly instead of a generic "+N more"
            pill so the user knows what's stacked behind the headline
            without having to expand. Indented under the event name
            (pl-6 ≈ icon size + gap-2) so the "+" reads as a
            continuation of the primary line rather than a new
            top-level bullet. */}
        {sorted.length > 1 && (
          <div className="truncate pl-6 text-xs text-muted-foreground">
            +{" "}
            {sorted
              .slice(1)
              .map((f) => f.properties.event)
              .join(", ")}
          </div>
        )}
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
            className="overflow-hidden pt-2"
          >
            {sorted.map((f, i) => {
              // Per-row expiry — each alert has its own clock, so
              // parse independently. Same guard pattern as the top
              // alert above: NWS occasionally emits empty/truncated
              // expires strings, and `new Date(<malformed>).getTime()`
              // returns NaN that would render as "Invalid Date".
              const rowExpiresMs = f.properties.expires
                ? Date.parse(f.properties.expires)
                : NaN;
              const rowExpires = Number.isFinite(rowExpiresMs)
                ? new Date(rowExpiresMs)
                : null;
              const meta = [
                f.properties.areaDesc,
                rowExpires && `until ${formatClockWithDay(rowExpires, tz)}`,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  key={f.id ?? i}
                  className={cn(
                    "space-y-1 py-2",
                    // Per-row top divider for the multi-alert case so
                    // adjacent rows don't visually bleed into each
                    // other against the banner's tinted bg. The first
                    // row sits flush against the header chevron's
                    // implicit padding; subsequent rows get an
                    // explicit hairline.
                    i > 0 && "border-t border-foreground/10",
                  )}
                >
                  {/* Event row: structured event name on the left,
                      filled severity chip pinned to the right edge.
                      We render the NWS-supplied `event` field
                      directly — it's a short, well-formed type name
                      ("Extreme Heat Warning", "Air Quality Alert").
                      The verbatim `headline` field is metadata-heavy
                      ("…issued May 10 at 12:24AM MST until May 12 at
                      8:00PM MST by NWS Phoenix AZ") and the issuing
                      office / timestamps are reproduced more cleanly
                      below or available behind the NWS link. */}
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 break-words text-sm font-medium">
                      {f.properties.event}
                    </span>
                    <SeverityChip severity={f.properties.severity} />
                  </div>
                  {/* Meta row: areaDesc · until {expires} on the left,
                      "View on NWS" link inline on the right at sm+
                      (wraps below on mobile). The link's URL is
                      constructed once at the banner level from the
                      station's coords (`feature.id` would have been
                      the obvious choice but it points at
                      api.weather.gov's JSON endpoint, which renders
                      as raw JSON in a browser — not what a user
                      clicking "View on NWS" expects). All alerts
                      share the same MapClick URL because they're all
                      active for the same lat/lon; the destination
                      page surfaces every active alert plus the
                      regular forecast for context. */}
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-baseline sm:gap-3">
                    {meta && (
                      <span className="min-w-0 flex-1 break-words">
                        {meta}
                      </span>
                    )}
                    <a
                      href={nwsUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex shrink-0 items-center gap-1 transition-colors hover:text-foreground sm:ml-auto"
                    >
                      View on NWS
                      <ExternalLink className="size-3" aria-hidden />
                      <span className="sr-only"> (opens in new tab)</span>
                    </a>
                  </div>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}

/**
 * Compact severity badge that color-codes the alert by its NWS-reported
 * severity. Filled-pill style — solid token-paired bg/foreground so
 * the chip pops cleanly off the alpha-tinted banner regardless of
 * banner tone (the previous tinted-on-tinted approach blended the
 * chip into the banner when both shared a hue).
 *
 *   Extreme / Severe → destructive + destructive-foreground (red,
 *                     near-white text in light, dark text in dark)
 *   Moderate         → primary + primary-foreground (copper)
 *   Minor / Unknown  → muted + muted-foreground (quiet, neutral)
 *
 * Hidden only when severity is missing entirely (NWS does sometimes
 * omit the field for non-classified events).
 */
function SeverityChip({ severity }: { severity: string | undefined }) {
  if (!severity) return null;
  const lower = severity.toLowerCase();
  const tone =
    lower === "extreme" || lower === "severe"
      ? "bg-destructive text-destructive-foreground"
      : lower === "moderate"
        ? "bg-primary text-primary-foreground"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        tone,
      )}
    >
      {severity}
    </span>
  );
}
