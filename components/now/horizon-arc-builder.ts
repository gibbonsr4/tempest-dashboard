/**
 * Pure-data helpers for the HorizonBand arc rendering. Builds the
 * SVG path strings for the sun + moon's above- and below-horizon
 * segments, and projects "now" onto those arcs to position the
 * glyph overlays.
 *
 * Lives in its own file so the (~400-line) `HorizonBand.tsx`
 * component stays focused on rendering. The math here is
 * UI-constant-free — viewport coordinates come in via `xFor` and
 * `altToY` callbacks supplied by the caller.
 */

export type Sample = {
  ts: number;
  sunAlt: number;
  sunAz: number;
  moonAlt: number;
  moonAz: number;
};

/**
 * Build separate above-horizon and below-horizon path strings for the
 * given body, splitting the continuous arc at horizon crossings so the
 * UI can render each segment with its own stroke style.
 *
 * When two adjacent samples straddle the horizon, both end up in their
 * own segment but neither sample sits AT y=HORIZON_Y — so the rendered
 * line ends slightly above the horizon on one side and resumes
 * slightly below on the other, producing a small visual jump. We
 * linearly interpolate the exact horizon crossing (where alt = 0) and
 * append that point to BOTH segments so they meet cleanly on the line.
 */
export function buildArcSegments(
  samples: Sample[],
  body: "sun" | "moon",
  xFor: (ms: number) => number,
  altToY: (alt: number) => number,
): { above: string; below: string } {
  const above: string[][] = [];
  const below: string[][] = [];
  let curAbove: string[] | null = null;
  let curBelow: string[] | null = null;
  const altOf = (s: Sample) => (body === "sun" ? s.sunAlt : s.moonAlt);
  const horizonY = altToY(0).toFixed(1);

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const alt = altOf(s);
    const x = xFor(s.ts);
    const y = altToY(alt);
    const point = `${x.toFixed(1)},${y.toFixed(1)}`;
    const isAbove = alt >= 0;

    if (isAbove) {
      if (!curAbove) {
        curAbove = [];
        above.push(curAbove);
      }
      curAbove.push(point);
    } else {
      if (!curBelow) {
        curBelow = [];
        below.push(curBelow);
      }
      curBelow.push(point);
    }

    // If we cross the horizon between this sample and the next, append
    // an interpolated crossing point to BOTH segments so the arcs meet
    // cleanly at y=HORIZON_Y instead of jumping across the gap between
    // the two sample timestamps.
    if (i + 1 < samples.length) {
      const nextAlt = altOf(samples[i + 1]);
      const crosses = isAbove !== (nextAlt >= 0);
      if (crosses) {
        // Linear interpolation factor where alt(t) = 0. Same formula
        // works for both ascending and descending crossings:
        //   t = alt / (alt - nextAlt)
        const t = alt / (alt - nextAlt);
        const nextX = xFor(samples[i + 1].ts);
        const cx = (x + t * (nextX - x)).toFixed(1);
        const cPoint = `${cx},${horizonY}`;
        // Adding the active-segment guard (`&& curAbove` /
        // `&& curBelow`) makes TypeScript narrow the type instead of
        // requiring `!` assertions. Logically the segment IS
        // guaranteed non-null at this point — the earlier branch in
        // this iteration just pushed `point` into it — but the
        // explicit guard keeps a future refactor of the segment
        // builder from silently breaking on a missed initialization.
        if (isAbove && curAbove) {
          curAbove.push(cPoint);
          curAbove = null;
          curBelow = [cPoint];
          below.push(curBelow);
        } else if (!isAbove && curBelow) {
          curBelow.push(cPoint);
          curBelow = null;
          curAbove = [cPoint];
          above.push(curAbove);
        }
      }
    }
  }

  const toPath = (chunks: string[][]) =>
    chunks
      .filter((c) => c.length > 1)
      .map((c) => `M ${c.join(" L ")}`)
      .join(" ");
  return { above: toPath(above), below: toPath(below) };
}

/**
 * Linearly interpolate the (x, y) screen position of the sun or moon
 * at `nowMs`, plus the altitude in radians (so callers can dim the
 * glyph when the body is below horizon rather than hiding it). Takes
 * the same `xFor` / `altToY` mappers as `buildArcSegments` so the
 * helper stays UI-constant-free.
 */
export function positionFromArc(
  samples: Sample[],
  body: "sun" | "moon",
  nowMs: number,
  xFor: (ms: number) => number,
  altToY: (alt: number) => number,
): { x: number; y: number; alt: number } | null {
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (nowMs <= first.ts || nowMs >= last.ts) return null;

  let i = 0;
  while (i < samples.length - 1 && samples[i + 1].ts < nowMs) i++;
  const a = samples[i];
  const b = samples[i + 1];
  const t = (nowMs - a.ts) / (b.ts - a.ts);

  const altA = body === "sun" ? a.sunAlt : a.moonAlt;
  const altB = body === "sun" ? b.sunAlt : b.moonAlt;
  const alt = altA + (altB - altA) * t;

  return { x: xFor(nowMs), y: altToY(alt), alt };
}
