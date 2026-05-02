import * as React from "react";

/**
 * Legend swatch that hints at the underlying chart geometry — solid
 * or dashed line, bar, or filled area — so the user can tell at a
 * glance which series each entry maps to without having to hover.
 * The temperature swatch can render as a multi-stop gradient
 * (`gradient`) to mirror the chart's cool→warm spectrum line.
 *
 * Used by `ForecastHourly`'s legend strip below the chart. Lives in
 * its own file because the SVG-driven swatch logic is ~90 lines and
 * was inflating the parent component past 700 lines.
 */
export function LegendItem({
  swatchKind,
  color,
  label,
  dashed = false,
  gradient = false,
}: {
  swatchKind: "line" | "bar" | "area";
  /** Required when `gradient` is false. */
  color?: string;
  label: string;
  /** Renders the line with a dash pattern (only "line" kind). */
  dashed?: boolean;
  /** Renders the line with the chart's cool→warm temperature
   *  gradient (only "line" kind; ignores `color`). */
  gradient?: boolean;
}) {
  const reactId = React.useId();
  const gradId = `legend-temp-grad-${reactId}`;
  const stroke = gradient ? `url(#${gradId})` : color;

  return (
    <span className="inline-flex items-center gap-1.5">
      <svg
        width={14}
        height={10}
        viewBox="0 0 14 10"
        aria-hidden
        className="shrink-0"
      >
        {gradient && (
          <defs>
            {/* `gradientUnits="userSpaceOnUse"` is load-bearing here:
                the default `objectBoundingBox` is relative to the
                stroked element's bbox, and a horizontal line has a
                near-zero-height bbox — the gradient collapses and
                the stroke renders as nothing. Using user-space
                pixel coordinates that match the line's endpoints
                makes the gradient render reliably. */}
            <linearGradient
              id={gradId}
              x1="1"
              y1="5"
              x2="13"
              y2="5"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="var(--temp-cool)" />
              <stop offset="50%" stopColor="var(--temp-mild)" />
              <stop offset="100%" stopColor="var(--temp-warm)" />
            </linearGradient>
          </defs>
        )}
        {swatchKind === "line" && (
          <line
            x1={1}
            y1={5}
            x2={13}
            y2={5}
            stroke={stroke}
            strokeWidth={dashed ? 1.5 : 2}
            strokeLinecap="round"
            strokeDasharray={dashed ? "3 2" : undefined}
            opacity={dashed ? 0.85 : 1}
          />
        )}
        {swatchKind === "bar" && (
          <rect x={5} y={1} width={4} height={8} rx={1} fill={color} fillOpacity={0.7} />
        )}
        {swatchKind === "area" && (
          <>
            <rect x={1} y={4} width={12} height={5} fill={color} fillOpacity={0.18} />
            <line
              x1={1}
              y1={4}
              x2={13}
              y2={4}
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.5}
            />
          </>
        )}
      </svg>
      {label}
    </span>
  );
}
