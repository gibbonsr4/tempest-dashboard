/**
 * Tooltip building blocks for `DailyAggregateChart`. Lives in its
 * own file because the swatch-shape logic for distinguishing band /
 * line / bar / dashed series adds ~45 lines of JSX that didn't need
 * to share scope with the parent chart.
 */

/**
 * Single labelled row in the chart's custom tooltip. The swatch
 * shape echoes the on-chart visual for that series — a 2px-tall
 * band for ranges, a horizontal line for mean / max, a small bar
 * block for sums, a dashed stub for previous-period overlays — so a
 * glance lines the row up with the chart element it's describing.
 */
export function TooltipRow({
  color,
  swatchKind,
  label,
  value,
  unit,
}: {
  color: string;
  swatchKind: "band" | "line" | "bar" | "dashed";
  label: string;
  value: string;
  unit: string;
}) {
  const swatch =
    swatchKind === "band" ? (
      <span
        className="h-2 w-2.5 shrink-0 rounded-[1px]"
        style={{ backgroundColor: color, opacity: 0.4 }}
      />
    ) : swatchKind === "line" ? (
      <span
        className="h-0.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
    ) : swatchKind === "bar" ? (
      <span
        className="h-2.5 w-2 shrink-0 rounded-sm"
        style={{ backgroundColor: color }}
      />
    ) : (
      <span
        className="h-0 w-2.5 shrink-0 border-t border-dashed"
        style={{ borderColor: color }}
      />
    );
  return (
    <div className="flex items-center gap-2">
      {swatch}
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
        {value}
        <span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span>
      </span>
    </div>
  );
}
