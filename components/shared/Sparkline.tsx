"use client";

import * as React from "react";

/**
 * Tiny SVG line chart suitable for inline use inside cards. No axes,
 * no tooltip — just a line (and optional area fill) sized to fit its
 * container. The component is purely presentational; callers pass in
 * pre-aggregated values.
 *
 * Sizing model: `width` and `height` define the viewBox coordinate
 * space the path math is computed in, but the SVG's actual rendered
 * size is CSS-driven (`width="100%"` style + `preserveAspectRatio
 * "none"`). Callers control display size via `className` — pass e.g.
 * `w-[56px] sm:w-[80px]` to size responsively. Defaults preserve the
 * original 120×28 footprint when no className overrides it.
 */
export function Sparkline({
  values,
  width = 120,
  height = 28,
  strokeColor = "currentColor",
  fillColor,
  strokeWidth = 1.5,
  className,
  ariaLabel,
}: {
  values: number[];
  width?: number;
  height?: number;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  className?: string;
  ariaLabel?: string;
}) {
  if (values.length < 2) {
    // Render a placeholder line so the layout doesn't shift while we
    // wait for data to arrive.
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        style={{ width: "100%", height: `${height}px` }}
        preserveAspectRatio="none"
        role={ariaLabel ? "img" : undefined}
        aria-label={ariaLabel}
      >
        <line
          x1={0}
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    // pad 2px top/bottom so stroke doesn't clip
    const y = 2 + (height - 4) * (1 - (v - min) / span);
    return [x, y] as const;
  });

  const pathD = points
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(" ");

  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ width: "100%", height: `${height}px` }}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      {fillColor && <path d={areaD} fill={fillColor} fillOpacity={0.2} />}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
