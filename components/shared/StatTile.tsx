import * as React from "react";

/**
 * Compact stat tile used in expanded card layouts (lightning, rain,
 * celestial). Renders a small uppercase label, a tabular value with
 * an optional unit, and an optional muted caption underneath.
 *
 * Extracted from three near-identical local components
 * (`LightningTile`, `RainTile`, `Tile`) — the visual rule was
 * "label / big value / unit / caption" with minor gap variations
 * across the original copies. Standardized on `gap-1.5` (the more
 * common spacing) so the row scans uniformly across cards.
 */
export function StatTile({
  label,
  value,
  unit,
  caption,
  className,
}: {
  label: string;
  value: string;
  /** Optional unit suffix (e.g. "in", "mph", "strikes"). */
  unit?: string;
  /** Optional muted caption — typically the date/time the value
   *  was recorded. */
  caption?: string;
  className?: string;
}) {
  return (
    <div
      className={
        "flex flex-col gap-1.5 rounded-lg border border-border/50 bg-card/40 px-3 py-2.5" +
        (className ? ` ${className}` : "")
      }
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="tabular leading-none text-base font-medium">
          {value}
        </span>
        {unit && (
          <span className="text-[10px] text-muted-foreground">{unit}</span>
        )}
      </div>
      {caption && (
        <div className="text-[10px] tabular text-muted-foreground leading-none">
          {caption}
        </div>
      )}
    </div>
  );
}
