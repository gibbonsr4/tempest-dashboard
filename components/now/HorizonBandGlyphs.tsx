"use client";

import * as React from "react";
import { motion } from "framer-motion";

/**
 * Visual primitives for the HorizonBand: sun + moon discs, the sun's
 * pulsing ray halo, the night starfield, and the small subtitle-row
 * glyphs. Extracted from HorizonBand.tsx so the parent file can stay
 * focused on band-level state + layout (ticks, arcs, sky background).
 *
 * Each glyph is anchored via `GlyphOverlay`, an HTML wrapper that
 * positions a fixed-size SVG at a percent of the parent band's
 * coordinate space. This dodges the band SVG's
 * `preserveAspectRatio="none"` stretching — circles inside a
 * non-uniformly stretched SVG would render as ellipses on wide
 * viewports. By rendering glyphs in their own un-stretched SVGs and
 * placing them with HTML positioning, we keep them perfectly round
 * while still aligning with the band's coordinate system.
 */

// ─── Moon-phase math ────────────────────────────────────────────────

/**
 * SVG path for the bright (illuminated) region of the moon, using the
 * actual lunar terminator geometry. The terminator is an ellipse
 * centered at the moon's center with semi-major = r (vertical,
 * pole-to-pole) and semi-minor `a = r·|2f − 1|` (horizontal). The
 * bright region is bounded by half the moon's edge plus half the
 * terminator ellipse — which half depends on waxing/waning and
 * crescent/gibbous:
 *
 *   waxing crescent  → moon's right half + terminator's right half
 *   waxing gibbous   → moon's right half + terminator's left half
 *   waning gibbous   → moon's left half  + terminator's right half
 *   waning crescent  → moon's left half  + terminator's left half
 *
 * Edge cases work out automatically: at f=0.5 the terminator becomes
 * a vertical line (semi-minor = 0); at f=1 the path is the full disc.
 */
export function brightMoonPath(
  cx: number,
  cy: number,
  r: number,
  phase: number,
  fraction: number,
): string {
  const waxing = phase < 0.5;
  const gibbous = fraction > 0.5;
  const a = r * Math.abs(2 * fraction - 1);
  // Moon edge sweep: 1 (positive-angle, passes through the right side)
  // traces the right semicircle from north pole to south; 0 traces
  // the left semicircle.
  const moonSweep = waxing ? 1 : 0;
  // Terminator sweep: 1 goes via the LEFT half of the ellipse (passes
  // through (cx-a, cy)), 0 via the RIGHT half. Picking the wrong side
  // turns gibbous into a crescent (and vice-versa) because the path
  // ends up enclosing the *thin* region instead of the *fat* one.
  //
  //   waxing crescent  → right semicircle + right half  → sweep 0
  //   waxing gibbous   → right semicircle + left half   → sweep 1
  //   waning gibbous   → left  semicircle + right half  → sweep 0
  //   waning crescent  → left  semicircle + left half   → sweep 1
  const terminatorSweep = waxing === gibbous ? 1 : 0;
  return [
    `M ${cx} ${cy - r}`,
    `A ${r} ${r} 0 0 ${moonSweep} ${cx} ${cy + r}`,
    `A ${a} ${r} 0 0 ${terminatorSweep} ${cx} ${cy - r}`,
    "Z",
  ].join(" ");
}

// ─── Subtitle-row glyphs ────────────────────────────────────────────

/**
 * A small filled-disc sun glyph for the subtitle row, sized to
 * match `SubtitleMoon` so the left/right summaries read as
 * symmetrical sun-and-moon clusters.
 */
export function SubtitleSun() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden>
      <circle cx={8} cy={8} r={7} fill="var(--sun-bright)" />
    </svg>
  );
}

/** A small standalone moon-phase glyph for the subtitle row. */
export function SubtitleMoon({
  phase,
  fraction,
}: {
  phase: number;
  fraction: number;
}) {
  const r = 7;
  const cx = 8;
  const cy = 8;
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden>
      <circle cx={cx} cy={cy} r={r} fill="var(--moon-dark-subtitle)" />
      <path
        d={brightMoonPath(cx, cy, r, phase, fraction)}
        fill="var(--moon-bright)"
      />
    </svg>
  );
}

// ─── Glyph overlays (rendered outside the stretched SVG) ────────────

/**
 * Wrapper that anchors a fixed-size glyph SVG to a percent position
 * within the parent band. The percent values come from
 * `(svgX / VIEW_W) * 100` etc., so the glyph lines up with everything
 * inside the parent SVG even though the parent uses
 * `preserveAspectRatio="none"`. The glyph itself stays a perfect
 * circle because it lives in its own non-stretched SVG.
 */
function GlyphOverlay({
  xPct,
  yPct,
  size,
  children,
}: {
  xPct: number;
  yPct: number;
  size: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        width: 0,
        height: 0,
      }}
    >
      {/* Mobile renders the disc at 75% scale (24px → 18px effective)
          so it's less visually dominant in the shorter h-[160px]
          mobile band. transform-origin defaults to center so the
          disc stays anchored at the same percentage point on the
          band regardless of scale. */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="scale-75 sm:scale-100"
        style={{
          position: "absolute",
          left: -size / 2,
          top: -size / 2,
          overflow: "visible",
        }}
      >
        {children}
      </svg>
    </div>
  );
}

/** Inner SVG element for a moon at a given size + phase. Used by `MoonOverlay`. */
function MoonGlyph({
  cx,
  cy,
  r,
  phase,
  fraction,
}: {
  cx: number;
  cy: number;
  r: number;
  phase: number;
  fraction: number;
}) {
  // Above/below state is conveyed by an opacity wrapper applied at
  // the MoonOverlay level, so the glyph itself always uses the
  // full-saturation `--moon-dark` / `--moon-bright` tokens.
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="var(--moon-dark)" />
      <path
        d={brightMoonPath(cx, cy, r, phase, fraction)}
        fill="var(--moon-bright)"
      />
    </g>
  );
}

/**
 * Pulsing rays behind the sun disc. Eight thin spokes that breathe
 * outward and back over a ~5s period — the rays grow slightly
 * longer and brighter at the peak of the cycle, then settle, like
 * the sun is gently radiating warmth. No rotation: the spokes stay
 * at fixed angles so the eye doesn't read directional motion.
 *
 * The pulse uses combined `scale` + `opacity` on the rays group,
 * with `non-scaling-stroke` on each line so the stroke width stays
 * constant as the rays elongate. The disc itself (rendered by
 * `SunDisc` on top of this) does not animate — sun/moon parity is
 * preserved at the body's anchor point.
 *
 * Honors `useReducedMotion` — collapses to a static rays group at
 * scale 1 with no pulse when the user prefers reduced motion.
 *
 * Only rendered when the sun is above horizon.
 */
export function SunGlow({
  xPct,
  yPct,
  reduceMotion,
}: {
  xPct: number;
  yPct: number;
  reduceMotion: boolean;
}) {
  // SIZE has to fit the longest ray at peak scale (1.18 × r2=15 ≈
  // 17.7 from center=20) plus a tiny margin — 40px gives the rays
  // room to render without clipping at the disc bounding box.
  const SIZE = 40;
  const center = SIZE / 2;
  // Eight rays equally spaced 45° apart. r1 = ray inner edge (just
  // outside the 10px disc); r2 = ray outer edge at rest.
  const rays = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 8;
    const r1 = 12;
    const r2 = 15;
    return {
      x1: center + Math.cos(angle) * r1,
      y1: center + Math.sin(angle) * r1,
      x2: center + Math.cos(angle) * r2,
      y2: center + Math.sin(angle) * r2,
    };
  });
  return (
    <GlyphOverlay xPct={xPct} yPct={yPct} size={SIZE}>
      <motion.g
        style={{ transformOrigin: `${center}px ${center}px` }}
        initial={{ scale: 1, opacity: 0.4 }}
        animate={
          reduceMotion
            ? { scale: 1, opacity: 0.4 }
            : { scale: [1, 1.18, 1], opacity: [0.32, 0.55, 0.32] }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 5, repeat: Infinity, ease: "easeInOut" }
        }
      >
        {rays.map((ray, i) => (
          <line
            key={i}
            x1={ray.x1}
            y1={ray.y1}
            x2={ray.x2}
            y2={ray.y2}
            stroke="var(--sun-bright)"
            strokeWidth={1.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </motion.g>
    </GlyphOverlay>
  );
}

/**
 * Mulberry32-style deterministic generator. Returns an array of N
 * pseudo-random numbers seeded from `seed`. Pure function: same
 * input → same output, no mutation visible to callers.
 *
 * Lives at module scope (not inside `Stars`) because React 19's hook-
 * immutability rule rejects `let s` reassignment inside `useMemo` even
 * when the mutation is purely local to the closure. Hoisting the PRNG
 * sidesteps the lint rule and makes the determinism explicit.
 */
function deterministicRandoms(seed: number, count: number): number[] {
  let s = seed >>> 0;
  const out = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return out;
}

/**
 * 12 deterministic star positions, seeded once at module load. The
 * starfield never changes across renders / mounts / sessions so we
 * skip both `useMemo` and the `let`-mutation pattern.
 *
 * Layout choices (see `Stars` doc): X spread full band width, Y biased
 * to upper third of the sky region, tiny radii, modest opacity — the
 * effect is "quiet supplement", not feature reveal.
 */
const STAR_FIELD = (() => {
  // 4 random draws per star → 48 total.
  const rs = deterministicRandoms(0xdeadbeef, 48);
  return Array.from({ length: 12 }, (_, i) => ({
    xPct: rs[i * 4 + 0] * 100,
    yPct: 4 + rs[i * 4 + 1] * 28,
    r: 0.6 + rs[i * 4 + 2] * 0.5,
    opacity: 0.4 + rs[i * 4 + 3] * 0.3,
  }));
})();

/**
 * Subtle starfield. Only fades in at the deepest sky phase
 * (sun > 12° below horizon). Positions come from `STAR_FIELD`
 * (module-level constant). Renders as HTML circles (not SVG) so the
 * parent's `preserveAspectRatio="none"` stretching doesn't squash
 * them into ellipses. Slight cool tint (vs pure white) so they sit
 * naturally against the navy night sky rather than jumping ahead of
 * the moon.
 */
export function Stars({
  visible,
  reduceMotion,
}: {
  visible: boolean;
  reduceMotion: boolean;
}) {
  const stars = STAR_FIELD;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden
      style={{
        opacity: visible ? 1 : 0,
        // Shorter than the 1s sky-color crossfade so the stars feel
        // like a quiet supplement, not a feature reveal.
        transition: reduceMotion ? undefined : "opacity 0.6s ease-out",
      }}
    >
      {stars.map((star, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${star.xPct}%`,
            top: `${star.yPct}%`,
            width: `${star.r * 2}px`,
            height: `${star.r * 2}px`,
            // Slight cool tint instead of pure white — sits more
            // naturally against the saturated navy sky.
            background: "oklch(0.96 0.02 230)",
            opacity: star.opacity,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
}

export function SunDisc({
  xPct,
  yPct,
  alt,
}: {
  xPct: number;
  yPct: number;
  alt: number;
}) {
  // Disc radius is constant — sun and moon glyphs read as equal
  // visual weight regardless of altitude. Above/below state is
  // conveyed via opacity (full above horizon, 0.5 below) rather
  // than a separate dim color: opacity is colorblind-safe, theme-
  // independent, and keeps the body recognizably "the sun" at any
  // time of day.
  const SIZE = 24;
  const r = 10;
  const above = alt > 0;
  return (
    <GlyphOverlay xPct={xPct} yPct={yPct} size={SIZE}>
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={r}
        fill="var(--sun-bright)"
        stroke="var(--sun-bright-stroke)"
        strokeWidth={1}
        opacity={above ? 1 : 0.5}
      />
    </GlyphOverlay>
  );
}

export function MoonOverlay({
  xPct,
  yPct,
  alt,
  phase,
  fraction,
}: {
  xPct: number;
  yPct: number;
  alt: number;
  phase: number;
  fraction: number;
}) {
  // Match SunDisc — fixed radius, full color always, opacity 0.5
  // below horizon. Drops the previous `dim` color tokens
  // (`--moon-dark-dim`, `--moon-bright-dim`) since opacity covers
  // the same UX with one consistent rule.
  const SIZE = 24;
  const r = 10;
  const above = alt > 0;
  return (
    <GlyphOverlay xPct={xPct} yPct={yPct} size={SIZE}>
      <g opacity={above ? 1 : 0.5}>
        <MoonGlyph
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          phase={phase}
          fraction={fraction}
        />
      </g>
    </GlyphOverlay>
  );
}
