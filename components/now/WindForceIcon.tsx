"use client";

import { cn } from "@/lib/utils";

/**
 * Five-bar indicator for Beaufort wind force, similar to a cell-signal
 * icon but stepped to communicate intensity at a glance. The intent is
 * a user who doesn't know "F1 = Light air" can still read "more bars =
 * more wind". The Beaufort name is exposed via `title` for screen
 * readers and tooltips.
 *
 * Mapping (Beaufort → active bars):
 *   F0    → 0 bars   Calm
 *   F1–2  → 1 bar    Light air / Light breeze
 *   F3–4  → 2 bars   Gentle / Moderate breeze
 *   F5–6  → 3 bars   Fresh / Strong breeze
 *   F7–8  → 4 bars   High wind / Gale
 *   F9–12 → 5 bars   Storm and above (rendered in destructive red)
 */
export function WindForceIcon({
  level,
  name,
  className,
}: {
  level: number;
  name: string;
  className?: string;
}) {
  const bars =
    level === 0
      ? 0
      : level <= 2
        ? 1
        : level <= 4
          ? 2
          : level <= 6
            ? 3
            : level <= 8
              ? 4
              : 5;
  const danger = level >= 9;
  const w = 32;
  const h = 18;
  const barW = 4;
  const gap = 2;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={cn("shrink-0", className)}
      role="img"
      aria-label={`Wind force: ${name}`}
    >
      <title>{name}</title>
      {Array.from({ length: 5 }, (_, i) => {
        const active = i < bars;
        const barH = 4 + i * 2.8;
        const x = i * (barW + gap);
        const y = h - barH;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={barH}
            rx={1}
            className={
              active
                ? danger
                  ? "fill-destructive"
                  : "fill-primary"
                : "fill-muted"
            }
          />
        );
      })}
    </svg>
  );
}
