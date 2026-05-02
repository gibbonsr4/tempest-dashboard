"use client";

/**
 * "Active right now" hero shown above the historical tile grid in
 * adaptive cards (rain, lightning) when something live is happening
 * — `rate > 0` for rain, `count_1hr > 0` for lightning.
 *
 * Larger value + accent color so the eye lands on the volatile
 * real-time number first; the tile grid below carries the
 * historical context. Mounted/unmounted by the caller — this
 * component doesn't gate itself.
 *
 * `color` is a CSS color value (var or literal). The border and
 * background are derived via `color-mix` so the accent reads as
 * "warm tinted" against the card surface without needing a second
 * token.
 */
export function ActiveRateHero({
  label,
  value,
  unit,
  subtitle,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  subtitle?: string;
  color: string;
}) {
  return (
    <div
      className="rounded-lg border px-4 py-3"
      style={{
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 5%, transparent)`,
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div
            className="text-[10px] uppercase tracking-wide font-medium leading-none"
            style={{ color }}
          >
            {label}
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span
              className="tabular text-3xl font-light leading-none"
              style={{ color }}
            >
              {value}
            </span>
            <span className="text-xs text-muted-foreground">{unit}</span>
          </div>
        </div>
        {subtitle && (
          <div className="text-xs text-muted-foreground tabular text-right">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
