"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import SunCalc from "suncalc";
import { Card } from "@/components/ui/card";
import { useNow } from "@/lib/hooks/useNow";
import { formatClock, formatDuration, startOfStationDay } from "@/lib/tempest/format";
import { useStationTz } from "@/lib/tempest/tz-context";
import { horizonForDay, moonPhaseName } from "@/lib/astronomy/horizon";
import { buildArcSegments, positionFromArc } from "./horizon-arc-builder";
import {
  daylightDeltaMs,
  nextMoonPhase,
  nextSolstice,
} from "@/lib/astronomy/celestial";
import { nextEclipse } from "@/lib/astronomy/eclipses";
import { cn } from "@/lib/utils";
import {
  CelestialPanel,
  computeAlertState,
} from "./HorizonBandCelestial";
import {
  MoonOverlay,
  Stars,
  SubtitleMoon,
  SubtitleSun,
  SunDisc,
  SunGlow,
} from "./HorizonBandGlyphs";

/**
 * Full-width 24-hour sky band. Renders a tasteful day-night gradient,
 * the sun's path across the day (parabolic-ish arc above the horizon
 * line), the moon's path with its phase rendered as a partial fill,
 * and a "now" indicator that updates every minute.
 *
 * The band is computed once on mount per (day, lat, lon). The "now"
 * line is the only piece that updates per minute. We apply the
 * astronomy in real time on the client (cheap; suncalc is tiny) so
 * the component is tz-safe regardless of where it's rendered from.
 */

const VIEW_W = 1000; // SVG viewBox width (responsive via preserveAspectRatio)
const VIEW_H = 220;
// Horizon line is centered vertically so the sky and ground halves of
// the band read as mirror images. Peak / trough Y values are
// equidistant from the horizon so sun and moon arcs span the same
// vertical range above and below — earlier asymmetric values
// (HORIZON_Y at 0.55, peak at 0.16, low at 0.85) made the
// above-horizon arc visibly steeper than the below-horizon arc.
const HORIZON_Y = VIEW_H * 0.5; // 110 — centered
const SUN_PEAK_Y = VIEW_H * 0.2; // 44 — peak; 30% above horizon
const SUN_LOW_Y = VIEW_H * 0.8; // 176 — deepest below-horizon position
// Sun and moon share the same band envelope (SUN_PEAK_Y / SUN_LOW_Y);
// the latitude-aware projection in altMappers normalizes each body's
// altitude against its own theoretical max, so a single pair of band
// constants is sufficient to render both arcs proportionally.
const PADDING_X = 24;

interface Props {
  latitude: number;
  longitude: number;
}

export function HorizonBand({ latitude, longitude }: Props) {
  const nowMs = useNow();
  const reduceMotion = useReducedMotion();
  const tz = useStationTz();

  // The day window spans station-local midnight → next station-local
  // midnight. `startOfStationDay` derives the offset for this exact
  // instant from the IANA tz string, so it stays correct across DST
  // transitions for any station, not just Phoenix's fixed offset.
  // Anchored to `nowMs` so a page held open across local midnight
  // automatically rolls forward.
  const dayStartMs = React.useMemo(
    () => startOfStationDay(nowMs, tz),
    [nowMs, tz],
  );

  const data = React.useMemo(
    () => horizonForDay(new Date(dayStartMs), latitude, longitude),
    [dayStartMs, latitude, longitude],
  );

  // `xFor` only depends on `data` (specifically dayStart / dayEnd), so
  // memoizing it lets every consumer downstream — segment builders,
  // event markers, hour ticks — reference a stable function and
  // include it in their dep arrays without needing eslint-disables (S11).
  const xFor = React.useMemo(() => {
    const span = data.dayEnd - data.dayStart;
    return (ms: number) => {
      const t = (ms - data.dayStart) / span;
      return PADDING_X + Math.max(0, Math.min(1, t)) * (VIEW_W - PADDING_X * 2);
    };
  }, [data]);

  /**
   * Map an altitude (radians, +above / −below horizon) to a y position
   * on the band. Above-horizon altitudes spread across [HORIZON_Y, peakY],
   * below-horizon across [HORIZON_Y, lowY] — same scale on each side
   * relative to the peak/trough across the day.
   */
  // Astronomically-correct altitude scale: map altitude to the
  // station's MAXIMUM POSSIBLE altitude (latitude-derived) rather
  // than today's peak. Today's peak varies seasonally — at Phoenix
  // the sun reaches ~80° in summer and ~33° in winter — so daily-
  // relative scaling silently flattens the seasonal signal. With
  // latitude-relative scaling, summer arcs render tall, winter
  // arcs render shallow, and equinox-ish days fall between.
  //
  // Max altitude is `90° − |lat| + tilt`, capped at 90° (zenith) so
  // tropical stations where the body can pass directly overhead
  // don't end up with a max above 90°. Tilt is 23.5° for the sun
  // (Earth's axial tilt at solstice) and 28.5° for the moon (5° of
  // lunar-orbit inclination on top of the ecliptic).
  //
  // Both above- and below-horizon altitudes are normalized by the
  // SAME `maxRad`, then projected onto the symmetric SUN_PEAK_Y /
  // SUN_LOW_Y envelope. That means the rendered arc is NOT visually
  // mirrored across the horizon when the sun's lower-culmination
  // depth differs from its upper-culmination height (which is the
  // common case at non-equinox dates) — the arc above and the arc
  // below each render proportional to their actual altitudes, just
  // against a shared theoretical maximum.
  const altMappers = React.useMemo(() => {
    const absLat = Math.abs(latitude);
    const sunMaxDeg = Math.min(90, 90 - absLat + 23.5);
    const moonMaxDeg = Math.min(90, 90 - absLat + 28.5);
    const sunMaxRad = (sunMaxDeg * Math.PI) / 180;
    const moonMaxRad = (moonMaxDeg * Math.PI) / 180;
    const project = (alt: number, maxRad: number) => {
      // Clamp to [-1, 1] so freak high-latitude / extreme
      // declinations can't escape the band.
      const ratio = Math.max(-1, Math.min(1, alt / maxRad));
      return ratio >= 0
        ? HORIZON_Y - ratio * (HORIZON_Y - SUN_PEAK_Y)
        : HORIZON_Y - ratio * (SUN_LOW_Y - HORIZON_Y);
    };
    return {
      sun: (alt: number) => project(alt, sunMaxRad),
      moon: (alt: number) => project(alt, moonMaxRad),
    };
  }, [latitude]);

  // Sun arc — continuous across the full day. Above-horizon segment is
  // solid + warm copper; below-horizon segment is dimmed so the eye
  // reads "underground" without visual weight.
  const sunSegments = React.useMemo(
    () => buildArcSegments(data.samples, "sun", xFor, altMappers.sun),
    [data, xFor, altMappers],
  );

  const moonSegments = React.useMemo(
    () => buildArcSegments(data.samples, "moon", xFor, altMappers.moon),
    [data, xFor, altMappers],
  );

  // Find current (sun, moon) position by interpolation. Returns the
  // altitude in radians too so the caller can dim the glyph when below
  // the horizon line rather than hiding it altogether.
  const sunNow = positionFromArc(
    data.samples,
    "sun",
    nowMs,
    xFor,
    altMappers.sun,
  );
  const moonNow = positionFromArc(
    data.samples,
    "moon",
    nowMs,
    xFor,
    altMappers.moon,
  );

  const sunriseLabel = data.events.sunrise && formatClock(data.events.sunrise, tz);
  const sunsetLabel = data.events.sunset && formatClock(data.events.sunset, tz);
  const moonriseLabel = data.events.moonrise && formatClock(data.events.moonrise, tz);
  const moonsetLabel = data.events.moonset && formatClock(data.events.moonset, tz);

  // Three time-of-day states drive the sun-summary label:
  //   1. Before sunrise → "sunrise in Xh Ym" (counting up to today's
  //      sunrise from the pre-dawn hours)
  //   2. During daylight → "daylight Xh Ym remaining" (sunset – now)
  //   3. After sunset → "after sunset" (no countdown; the next event
  //      worth surfacing is tomorrow's sunrise, which the band's
  //      celestial-details panel covers)
  //
  // The earlier formulation only checked `nowMs < sunset`, which is
  // ALSO true at 1 AM — yielding a misleading "daylight 18h remaining"
  // before the sun has even come up. Anchoring against sunrise too
  // makes the label honest about which phase we're in.
  const sunriseMs = data.events.sunrise;
  const sunsetMs = data.events.sunset;
  const isBeforeSunrise = sunriseMs != null && nowMs < sunriseMs;
  const isDaytime =
    sunriseMs != null &&
    sunsetMs != null &&
    nowMs >= sunriseMs &&
    nowMs < sunsetMs;
  const remainingMs = isDaytime && sunsetMs != null ? sunsetMs - nowMs : 0;
  const untilSunriseMs =
    isBeforeSunrise && sunriseMs != null ? sunriseMs - nowMs : 0;

  const phase = moonPhaseName(data.moonPhase);

  // ─── Expanded "celestial details" data ─────────────────────────────
  // The card folds an expanded panel underneath the band's subtitle
  // row (driven by the disclosure button in the center). The data
  // here covers everything the band itself can't surface without
  // cluttering — civil dawn/dusk (the band shows ambient sky phase
  // but not the exact threshold times), the day's daylight total +
  // delta vs yesterday, and a few "what's next" milestones (full /
  // new moon, next solstice, next eclipse).
  //
  // Memoized on `dayStartMs` (which only flips at station-local
  // midnight) rather than `nowMs` (which flips every minute), so
  // SunCalc.getTimes + nextMoonPhase + nextEclipse run once per day
  // instead of 1440 times. The "next full moon" lookup in particular
  // is non-trivial (walks forward in hourly steps until the phase
  // crosses), so removing it from the per-minute path is a real win.
  const detail = React.useMemo(() => {
    const dayMid = new Date(dayStartMs + 12 * 3600_000);
    const sunTimes = SunCalc.getTimes(dayMid, latitude, longitude);
    const daylightMs =
      sunTimes.sunrise instanceof Date && sunTimes.sunset instanceof Date
        ? sunTimes.sunset.getTime() - sunTimes.sunrise.getTime()
        : null;
    return {
      daylightMs,
      deltaMs: daylightDeltaMs(dayMid, latitude, longitude),
      nextFull: nextMoonPhase(dayMid, "full"),
      nextNew: nextMoonPhase(dayMid, "new"),
      nextSol: nextSolstice(dayMid),
      nextEcl: nextEclipse(dayMid),
    };
  }, [dayStartMs, latitude, longitude]);

  // Disclosure label reacts to upcoming events: when something
  // genuinely interesting is coming up (eclipse soon, solstice today,
  // full/new moon today), surface it in the center of the subtitle
  // row in the primary copper accent. Otherwise the disclosure stays
  // muted with a generic "More details" label.
  const alert = computeAlertState(nowMs, tz, detail);

  const [open, setOpen] = React.useState(false);

  const ariaLabel = [
    sunriseLabel ? `Sunrise ${sunriseLabel}` : null,
    sunsetLabel ? `sunset ${sunsetLabel}` : null,
    `currently ${formatClock(nowMs, tz)}`,
    isDaytime
      ? `daylight ${formatDuration(remainingMs)} remaining`
      : isBeforeSunrise
        ? `sunrise in ${formatDuration(untilSunriseMs)}`
        : null,
    `moon ${phase}`,
  ]
    .filter(Boolean)
    .join(", ");

  // Pick the sky background based on the current sun altitude — a
  // single ambient color (not a horizontal time gradient) so the band
  // genuinely reflects "what's outside right now". Four phases keyed
  // to actual astronomical thresholds:
  //   day: alt > +6°   (≈ +0.105 rad — sun well above horizon)
  //   civil: -6° to +6° (golden hour, low warm sun glow)
  //   nautical: -12° to -6° (cool violet, sun below horizon)
  //   night: alt < -12° (sun deep below, fully dark sky)
  // Sunrise/sunset markers + the arcs still communicate the day's
  // progression on top of this ambient phase.
  const sunNowAlt = sunNow?.alt ?? -Math.PI / 2;
  const skyVar =
    sunNowAlt > 0.105
      ? "var(--horizon-sky-day)"
      : sunNowAlt > -0.105
        ? "var(--horizon-sky-civil)"
        : sunNowAlt > -0.21
          ? "var(--horizon-sky-nautical)"
          : "var(--horizon-sky-night)";
  // Stars only show at the deepest sky phase (sun below -12°) so
  // they read as a quiet, restrained atmospheric flourish rather
  // than competing with the warm civil/nautical phases. The Stars
  // component itself stays mounted across phases so the opacity
  // transition can crossfade them in/out.
  const isNight = sunNowAlt < -0.21;

  return (
    <Card className="overflow-hidden p-0">
      {/* Mobile band is shorter (h-[160px]) than desktop. With
          `preserveAspectRatio="none"` and a 1000:220 viewBox, the
          Y-stretch on a 370px-wide mobile viewport was making the
          sun/moon arcs read as steep peaks rather than smooth curves;
          shrinking the container reduces the Y stretch ratio so the
          arcs come closer to desktop's gentler slope. */}
      <div className="relative h-[160px] sm:h-[220px]">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height="100%"
        className="block"
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
      >
        {/* Sky — single ambient color from current sun altitude. The
            1s fade between phase changes is a Framer-bypassing CSS
            transition; gate it on `useReducedMotion()` so users opting
            out of motion get instant phase swaps (R11c). */}
        <rect
          x={0}
          y={0}
          width={VIEW_W}
          height={HORIZON_Y}
          fill={skyVar}
          style={reduceMotion ? undefined : { transition: "fill 1s ease-out" }}
        />
        {/* Ground — neutral surface tinted to the current theme */}
        <rect
          x={0}
          y={HORIZON_Y}
          width={VIEW_W}
          height={VIEW_H - HORIZON_Y}
          fill="var(--horizon-ground)"
        />
        <line
          x1={0}
          y1={HORIZON_Y}
          x2={VIEW_W}
          y2={HORIZON_Y}
          stroke="var(--horizon-horizon-line)"
          strokeWidth={1}
        />

        {/* Hour ticks every 3 hours — short marks straddling the
            horizon line. Labels render OUTSIDE this SVG (see HTML
            overlay below) because `preserveAspectRatio="none"`
            non-uniformly stretches glyph rendering, which made them
            unreadable on narrow viewports. */}
        {Array.from({ length: 9 }, (_, i) => i * 3).map((h) => {
          const t = data.dayStart + h * 3600_000;
          const x = xFor(t);
          return (
            <line
              key={h}
              x1={x}
              y1={HORIZON_Y - 3}
              x2={x}
              y2={HORIZON_Y + 3}
              stroke="var(--on-sky-hairline-mid)"
              strokeWidth={1}
            />
          );
        })}

        {/* Moon arc — solid above horizon, dashed below. */}
        {moonSegments.above && (
          <path
            d={moonSegments.above}
            fill="none"
            stroke="var(--moon-arc)"
            strokeWidth={1.4}
          />
        )}
        {moonSegments.below && (
          <path
            d={moonSegments.below}
            fill="none"
            stroke="var(--moon-arc-below)"
            strokeWidth={1.2}
            strokeDasharray="3 4"
          />
        )}

        {/* Sun arc — bright above horizon, muted below. */}
        {sunSegments.above && (
          <path
            d={sunSegments.above}
            fill="none"
            stroke="var(--sun-arc)"
            strokeWidth={2}
          />
        )}
        {sunSegments.below && (
          <path
            d={sunSegments.below}
            fill="none"
            stroke="var(--sun-arc-below)"
            strokeWidth={1.4}
            strokeDasharray="3 4"
          />
        )}

        {/* Sunrise / Sunset markers — short ticks across the horizon. */}
        {data.events.sunrise && (
          <line
            x1={xFor(data.events.sunrise)}
            x2={xFor(data.events.sunrise)}
            y1={HORIZON_Y - 6}
            y2={HORIZON_Y + 6}
            stroke="var(--sunrise-marker)"
            strokeWidth={1.5}
          />
        )}
        {data.events.sunset && (
          <line
            x1={xFor(data.events.sunset)}
            x2={xFor(data.events.sunset)}
            y1={HORIZON_Y - 6}
            y2={HORIZON_Y + 6}
            stroke="var(--sunset-marker)"
            strokeWidth={1.5}
          />
        )}

        {/*
         * Sun and moon glyphs were here. They've been moved OUT of
         * this `preserveAspectRatio="none"` SVG into fixed-size HTML
         * overlays below — that SVG attribute stretches everything
         * inside non-uniformly to fill the band, which turned the
         * circular discs into ellipses on wide screens. Positioning
         * the glyphs as absolutely-positioned overlays with percent
         * left/top keeps them on-axis with the band's coordinates
         * while the glyph SVGs themselves render at fixed pixel
         * sizes (no squish).
         */}

        {/* Vertical "now" rule removed — the sun and moon glyphs are
            already drawn at their current positions, so they double as
            "now" indicators without obscuring the moon's phase. */}

        {/* Sunrise / sunset times live in the subtitle under the band so
            they don't collide with the hour-tick labels at the same y. */}
      </svg>

      {/* Stars — quiet HTML overlay, only visible at the deepest
          night phase. Rendered before the sun/moon glyphs in DOM order
          so the moon disc paints over any stars at the moon's
          position. Mounted always so the opacity crossfade works in
          both directions; gated by `useReducedMotion` for users who
          opt out of motion. */}
      <Stars visible={isNight} reduceMotion={reduceMotion ?? false} />

      {/* Sun + moon glyphs — fixed-size SVG overlays positioned in
          HTML space using percent of the band's coordinate system.
          This avoids the non-uniform stretching the parent SVG applies
          via preserveAspectRatio="none". The two glyphs render at the
          same disc size so the sun and moon read as visually equal
          weight; their colors (warm vs cool) and the moon's phase
          terminator are enough to distinguish them. The breathing
          halo (`SunGlow`) is restored from an earlier revision but
          tuned smaller (28px vs the original 40px) so it doesn't tip
          the visual weight toward the sun over the moon. */}
      {sunNow && sunNow.alt > 0 && (
        <SunGlow
          xPct={(sunNow.x / VIEW_W) * 100}
          yPct={(sunNow.y / VIEW_H) * 100}
          reduceMotion={reduceMotion ?? false}
        />
      )}
      {sunNow && (
        <SunDisc
          xPct={(sunNow.x / VIEW_W) * 100}
          yPct={(sunNow.y / VIEW_H) * 100}
          alt={sunNow.alt}
        />
      )}
      {moonNow && (
        <MoonOverlay
          xPct={(moonNow.x / VIEW_W) * 100}
          yPct={(moonNow.y / VIEW_H) * 100}
          alt={moonNow.alt}
          phase={data.moonPhase}
          fraction={data.moonFraction}
        />
      )}

      {/* Hour labels rendered as HTML at fixed CSS pixel sizes so the
          SVG's `preserveAspectRatio="none"` stretching can't distort
          glyph rendering. Each label is anchored at the same X percent
          its tick-line uses inside the SVG, then centered on that
          point with `translateX(-50%)`. text-[11px] on mobile (was
          9px in the SVG) for legibility, scaling back to 9px at sm+. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0.5 h-3"
        aria-hidden
      >
        {Array.from({ length: 9 }, (_, i) => i * 3).map((h, i, arr) => {
          const t = data.dayStart + h * 3600_000;
          const xPct = (xFor(t) / VIEW_W) * 100;
          const label =
            h === 0 || h === 24 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`;
          // Edge labels would clip against the band's `overflow-hidden`
          // rounded card with the default `translateX(-50%)` centering
          // — at 402px, the leftmost "12a" sits ~9px from the left
          // edge before centering, so half the glyph would crop. Pin
          // the first label flush-left and the last flush-right.
          const isFirst = i === 0;
          const isLast = i === arr.length - 1;
          const transform = isFirst
            ? "translateX(0)"
            : isLast
              ? "translateX(-100%)"
              : "translateX(-50%)";
          return (
            <span
              key={h}
              className="absolute tabular text-[11px] leading-none sm:text-[9px]"
              style={{
                left: `${xPct}%`,
                transform,
                color: "var(--on-sky-text-muted)",
              }}
            >
              {label}
            </span>
          );
        })}
      </div>
      </div>
      {/* Subtitle row IS the disclosure button. On desktop the
          three zones lay out as [sun left, disclosure center, moon
          right]. On mobile the disclosure between sun and moon read
          as "moon details" (visually grouped wrong), so we drop it
          to a centered second row below the sun/moon row. The sun
          and moon summaries each get their own glyph (matching pair)
          so the two clusters are visually symmetrical. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="celestial-details-panel"
        className={cn(
          "block w-full px-4 py-3 text-left text-sm text-muted-foreground sm:text-xs",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {(() => {
          const sunSummary = (
            <span className="inline-flex items-center gap-2 tabular">
              <SubtitleSun />
              {/* Wrap each segment in `whitespace-nowrap` so when the
                  card is narrower than the full string (e.g. ~729px
                  desktop), wrapping only ever happens at the `·`
                  separators — never inside a duration like "5h 2m"
                  or a phrase like "after sunset". */}
              <span>
                {sunriseLabel && (
                  <span className="whitespace-nowrap">{`↑ ${sunriseLabel}`}</span>
                )}
                {sunriseLabel && sunsetLabel && " · "}
                {sunsetLabel && (
                  <span className="whitespace-nowrap">{`↓ ${sunsetLabel}`}</span>
                )}
                {(sunriseLabel || sunsetLabel) && " · "}
                <span className="whitespace-nowrap">
                  {isDaytime
                    ? `daylight ${formatDuration(remainingMs)} remaining`
                    : isBeforeSunrise
                      ? `sunrise in ${formatDuration(untilSunriseMs)}`
                      : "after sunset"}
                </span>
              </span>
            </span>
          );
          const moonSummary = (
            <span className="inline-flex items-center gap-2">
              <SubtitleMoon
                phase={data.moonPhase}
                fraction={data.moonFraction}
              />
              <span>
                {phase} · {Math.round(data.moonFraction * 100)}% lit
              </span>
            </span>
          );
          const disclosure = (
            <span
              className={cn(
                "inline-flex items-center gap-1.5",
                alert.alert
                  ? "text-primary font-medium"
                  : "text-muted-foreground",
              )}
            >
              {alert.alert && (
                <span
                  aria-hidden
                  className="inline-block size-1.5 rounded-full bg-primary"
                />
              )}
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-3.5 transition-transform",
                  open && "rotate-180",
                )}
              />
              <span>{open ? "Less details" : alert.label}</span>
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-3.5 transition-transform",
                  open && "rotate-180",
                )}
              />
            </span>
          );
          return (
            <>
              {/* Mobile: sun → moon stacked, disclosure centered
                  below as its own row. Two stacked rows for the
                  summaries because the sun-side text ("daylight Xh
                  Ym remaining") doesn't fit alongside the moon
                  summary at narrow widths. */}
              <div className="flex flex-col gap-2 sm:hidden">
                {sunSummary}
                {moonSummary}
                <div className="flex justify-center pt-1">{disclosure}</div>
              </div>
              {/* Desktop: 3-zone single row. Disclosure in the
                  center where it can also act as the alert payload
                  banner. We use `grid-cols-[1fr_auto_1fr]` rather
                  than `flex justify-between` because the sun
                  summary ("daylight Xh Ym remaining") is meaningfully
                  wider than the moon summary, and `justify-between`
                  on a flex row distributes leftover gap space
                  evenly — pushing the middle item ~60% across
                  instead of dead-center. The grid pattern pins the
                  middle column to its content width and gives both
                  sides equal `1fr` columns, so the disclosure stays
                  visually centered regardless of how lopsided the
                  sun vs. moon text are. */}
              <div className="hidden sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
                {sunSummary}
                {disclosure}
                <div className="justify-self-end">{moonSummary}</div>
              </div>
            </>
          );
        })()}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="celestial-detail"
            id="celestial-details-panel"
            role="region"
            aria-label="Celestial details"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 280, damping: 32 }
            }
            className="overflow-hidden"
          >
            <CelestialPanel
              data={data}
              detail={detail}
              moonriseLabel={typeof moonriseLabel === "string" ? moonriseLabel : null}
              moonsetLabel={typeof moonsetLabel === "string" ? moonsetLabel : null}
              tz={tz}
              nowMs={nowMs}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// `Sample`, `buildArcSegments`, and `positionFromArc` live in
// `./horizon-arc-builder.ts`. Pure-data math is separated from the
// rendering component to keep this file focused on layout.

