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
      .map(chunkToSmoothPath)
      .join(" ");
  return { above: toPath(above), below: toPath(below) };
}

/**
 * Convert a chunk of "x,y" sample points into a smooth cubic-Bezier
 * path, using Catmull-Rom interpolation. The curve passes exactly
 * through every sample point (so peak altitudes stay correct), but
 * the segments BETWEEN samples are smooth instead of straight —
 * which visually matters at the arc's apex, where adjacent line
 * segments would otherwise meet at a sharp angle and read as a
 * spike rather than a curve. With 96 samples/day there's enough
 * density for a clean smoothing at any zoom; the helper bails to
 * a plain `M…L…` for 2-point chunks (e.g., the tiny segment between
 * a horizon-crossing interpolation point and the adjacent sample).
 *
 * Tension parameter is the standard 1/6 = uniform Catmull-Rom.
 * Centripetal variant would avoid overshoot at sharp curvature
 * inflections, but the sun/moon paths are physically smooth, so
 * uniform behaves well here.
 */
function chunkToSmoothPath(chunk: string[]): string {
  if (chunk.length < 2) return "";
  if (chunk.length === 2) return `M ${chunk[0]} L ${chunk[1]}`;

  const points = chunk.map((p) => {
    const [x, y] = p.split(",").map(Number);
    return [x, y] as [number, number];
  });
  const n = points.length;
  let path = `M ${chunk[0]}`;
  for (let i = 0; i < n - 1; i++) {
    // For the first/last segments, duplicate the endpoint onto its
    // own out-of-chunk slot (`p0 = p1` at the start, `p3 = p2` at the
    // end). This collapses the imaginary surrounding-control point
    // onto the actual endpoint, giving a zero-length tangent
    // extension there — which keeps curvature finite and prevents
    // wild overshoot at chunk ends without inventing fake geometry.
    //
    // Codex review note: this DOES make the tangent at horizon-
    // crossing endpoints uniform-spacing-naive (the interpolated
    // crossing point can be much closer in time to its neighbour
    // than other samples are to each other). In practice the
    // sun/moon arcs are smooth enough that no visible overshoot
    // appears. If one ever does, linearize the segment touching the
    // crossing (replace `C` with `L` for `i === 0` or `i === n-2`
    // when the chunk's first/last point sits at horizonY).
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < n ? i + 2 : i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return path;
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
