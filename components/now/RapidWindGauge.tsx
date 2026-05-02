"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useLatestWind, useWindBuffer } from "@/lib/hooks/useRapidWind";
import { cardinal, mpsToMph } from "@/lib/tempest/conversions";
import { Sparkline } from "@/components/shared/Sparkline";

/**
 * Live wind gauge driven by the WebSocket rapid-wind feed. The pointer
 * rotates on `dirDeg` with a smooth Framer transition; the readout is
 * the most recent gust + cardinal label; the strip below is a 60-sample
 * sparkline showing the last ~3 minutes.
 *
 * The gauge speaks meteorological conventions: 0° points up (north),
 * direction is "wind from", clockwise.
 */
export function RapidWindGauge({ size = 220 }: { size?: number }) {
  const latest = useLatestWind();
  const buffer = useWindBuffer();
  const reduce = useReducedMotion();

  // No live data yet → render a neutral state. Defaulting `dir` to 0
  // pointed the dial at north and the readout at "N" before the first
  // WebSocket sample arrived, which read as a real wind from the user's
  // perspective. Now the pointer is hidden and the cardinal label
  // simply isn't drawn until we know the truth.
  const hasData = latest != null;
  const mph = hasData ? mpsToMph(latest.mps) : null;
  const dir = hasData ? latest.dirDeg : 0;

  // Pad the SVG so the pointer stroke doesn't clip at the edges.
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 16;

  // Tick marks every 30°
  const ticks = Array.from({ length: 12 }, (_, i) => i * 30);

  const sparkValues = buffer.map((s) => mpsToMph(s.mps));

  return (
    <div
      className="relative flex flex-col items-center"
      role="img"
      aria-label={
        mph != null
          ? `Wind: ${mph.toFixed(1)} miles per hour from ${cardinal(dir)}`
          : "Wind: awaiting live data"
      }
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="block aspect-square w-full max-w-[160px] overflow-visible sm:max-w-[200px]"
      >
        {/* Outer ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeWidth={1}
        />

        {/* Tick marks */}
        {ticks.map((deg) => {
          const isCardinal = deg % 90 === 0;
          const angleRad = ((deg - 90) * Math.PI) / 180;
          const inner = radius - (isCardinal ? 10 : 6);
          const outer = radius;
          const x1 = cx + inner * Math.cos(angleRad);
          const y1 = cy + inner * Math.sin(angleRad);
          const x2 = cx + outer * Math.cos(angleRad);
          const y2 = cy + outer * Math.sin(angleRad);
          return (
            <line
              key={deg}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeOpacity={isCardinal ? 0.5 : 0.2}
              strokeWidth={isCardinal ? 1.5 : 1}
            />
          );
        })}

        {/* Cardinal labels */}
        {(["N", "E", "S", "W"] as const).map((label, i) => {
          const deg = i * 90;
          const angleRad = ((deg - 90) * Math.PI) / 180;
          const r = radius - 22;
          const x = cx + r * Math.cos(angleRad);
          const y = cy + r * Math.sin(angleRad) + 4; // +4 visual baseline nudge
          return (
            <text
              key={label}
              x={x}
              y={y}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px] tracking-wide"
            >
              {label}
            </text>
          );
        })}

        {/* Pointer — rotates from north (0°), clockwise, around (cx,cy).
            transform-box: view-box pins the rotation origin to the SVG
            view-box coordinate space; without it, Framer rotates around
            the group's bbox center, which sits above the dial center
            because the pointer line is intentionally asymmetric.
            Hidden entirely until we have a real sample so the user
            doesn't see a confident pointer for "north" before any
            data arrives. */}
        {hasData && (
          <motion.g
            style={{
              transformBox: "view-box",
              transformOrigin: `${cx}px ${cy}px`,
            }}
            animate={{ rotate: dir }}
            initial={false}
            transition={
              reduce
                ? { duration: 0 }
                : { type: "spring", stiffness: 120, damping: 18, mass: 0.6 }
            }
          >
            <line
              x1={cx}
              y1={cy + 14}
              x2={cx}
              y2={cy - radius + 8}
              stroke="var(--primary)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy - radius + 8} r={4} fill="var(--primary)" />
            <circle cx={cx} cy={cy} r={6} fill="currentColor" fillOpacity={0.25} />
          </motion.g>
        )}
        {/* Faint center hub still drawn even with no data, so the
            dial doesn't look broken — just calm. */}
        {!hasData && (
          <circle cx={cx} cy={cy} r={6} fill="currentColor" fillOpacity={0.18} />
        )}
      </svg>

      <div className="mt-1 flex items-baseline gap-2">
        <span className="tabular text-3xl font-medium">
          {mph != null ? mph.toFixed(1) : "—"}
        </span>
        <span className="text-sm text-muted-foreground">mph</span>
        {hasData && (
          <span className="text-sm text-muted-foreground">{cardinal(dir)}</span>
        )}
      </div>

      <div className="mt-2 w-40 text-primary/80">
        <Sparkline
          values={sparkValues}
          width={160}
          height={24}
          strokeColor="currentColor"
          fillColor="currentColor"
          ariaLabel="Wind speed over the last three minutes"
        />
      </div>
    </div>
  );
}
