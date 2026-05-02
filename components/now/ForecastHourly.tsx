"use client";

import * as React from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { cToF, mpsToMph } from "@/lib/tempest/conversions";
import { formatClock } from "@/lib/tempest/format";
import { useStationTz } from "@/lib/tempest/tz-context";
import { formatInTimeZone } from "date-fns-tz";
import type {
  ForecastDaily,
  ForecastHourly as ForecastHour,
} from "@/lib/tempest/types";
import { LegendItem } from "./ForecastHourlyLegend";

/**
 * 24-hour forecast strip. Composed-chart with a vertical hover
 * crosshair, an honest tooltip showing time + temperature (and
 * precipitation when relevant), and a temperature line whose stroke
 * gradient is keyed to absolute °F (38° → 110° spectrum), so the
 * same value always reads the same color regardless of season —
 * a 75°F winter afternoon reads "warm", a 75°F summer night reads
 * "cool". Thresholds live in `app/globals.css` as `--temp-*` tokens.
 *
 * Layout decisions:
 *   - **Feels-like line auto-shows** when the max delta between
 *     air temp and feels-like exceeds 1°F across the window. In
 *     mild dry climates the two track within ~1° most of the time
 *     so the dashed companion would be invisible noise; in humid
 *     summers and wind-chill-driven winters the delta routinely
 *     hits 10-20°F and the line is the headline number people
 *     actually plan around.
 *   - **Wind layer renders whenever wind data is present** (no
 *     magnitude gate). Wind avg is a faint area at `fillOpacity 0.12`
 *     and the gust is a thin dashed line; the wind axis is visible
 *     on the right (mph) so values can be read off without hovering.
 *     The visual weight is muted enough that even unremarkable winds
 *     don't compete with the temperature line. Earlier revisions
 *     gated this on a peak-gust threshold (20 mph → 15 mph), but
 *     persistent presence keeps the chart's read predictable across
 *     the day-to-day range and the always-faded styling means calm
 *     days simply look calm.
 *   - Precipitation bars only render when at least one hour in the
 *     window has > 0% probability. The bar series uses a hidden
 *     secondary y-axis (0-100%) so its scale doesn't fight the temp
 *     axis.
 *   - Sunrise / sunset are dashed vertical reference lines with a
 *     time label above the plot area.
 */

interface Props {
  hours: ForecastHour[];
  /**
   * The full daily forecast array — we read sunrise/sunset from any
   * day whose events fall inside the visible window. Passing only
   * "today" was sufficient until the 24-hour window crossed midnight,
   * at which point tomorrow's sunrise belongs on the chart too.
   */
  days: ForecastDaily[];
}

export function ForecastHourly({ hours, days }: Props) {
  const tz = useStationTz();
  // Unique per-instance ids so two charts on one page don't collide
  // on the gradient / area `<defs>` references.
  const reactId = React.useId();
  const gradientId = `hourly-temp-gradient-${reactId}`;
  const areaId = `hourly-temp-area-${reactId}`;

  const slice = hours.slice(0, 24);

  if (slice.length < 2) {
    return (
      <Card className="p-4">
        <div className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
          Next 24 hours
        </div>
        <div className="text-sm text-muted-foreground">
          Forecast unavailable
        </div>
      </Card>
    );
  }

  const data = slice.map((h) => ({
    ts: h.time * 1000,
    tempF: h.air_temperature != null ? cToF(h.air_temperature) : null,
    feelsF: h.feels_like != null ? cToF(h.feels_like) : null,
    pop: h.precip_probability ?? 0,
    windAvgMph: h.wind_avg != null ? mpsToMph(h.wind_avg) : null,
    windGustMph: h.wind_gust != null ? mpsToMph(h.wind_gust) : null,
  }));

  const knownTemps = data.flatMap((d) =>
    d.tempF != null ? [d.tempF] : [],
  );
  if (knownTemps.length === 0) {
    return (
      <Card className="p-4">
        <div className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
          Next 24 hours
        </div>
        <div className="text-sm text-muted-foreground">
          Forecast unavailable
        </div>
      </Card>
    );
  }
  const minTRaw = Math.min(...knownTemps);
  const maxTRaw = Math.max(...knownTemps);
  // Pad the domain so the line doesn't sit on the chart edges; round
  // to whole degrees so the y-axis ticks stay tidy.
  const minT = Math.floor(minTRaw - 4);
  const maxT = Math.ceil(maxTRaw + 4);

  const hasPrecip = data.some((d) => d.pop > 0);

  // Climate-adaptive series visibility — see the file docstring.
  // Computed on client-side raw values so we don't render an empty
  // dashed line in dry climates or burn pixels on a flat wind area
  // when nothing's happening.
  const maxFeelsDelta = data.reduce((max, d) => {
    if (d.tempF == null || d.feelsF == null) return max;
    return Math.max(max, Math.abs(d.tempF - d.feelsF));
  }, 0);
  const showFeels = maxFeelsDelta > 1;

  const peakGust = data.reduce(
    (max, d) => (d.windGustMph != null ? Math.max(max, d.windGustMph) : max),
    0,
  );
  // Show the wind layer whenever the forecast carries any wind data at
  // all. The visual weight is intentionally muted (fill at 0.12,
  // dashed thin gust line) so even calm days don't compete with the
  // temperature line — there's no need for a magnitude gate, and the
  // layer's persistent presence makes the chart's read more
  // predictable across the day-to-day range.
  const showWind = data.some(
    (d) => d.windAvgMph != null || d.windGustMph != null,
  );
  // Wind axis ranges from 0 to peak gust + a small headroom, so the
  // gust line never grazes the chart top edge. Floor at 5 mph so the
  // axis isn't squished to nothing on truly calm days.
  const windMax = showWind ? Math.max(5, Math.ceil(peakGust + 5)) : 0;

  const dataStart = data[0].ts;
  const dataEnd = data[data.length - 1].ts;

  // Collect every sunrise/sunset that lands inside the visible window.
  // Iterating across all daily entries (not just `today`) keeps the
  // markers correct when the 24-hour strip crosses midnight.
  type SunEvent = { ts: number; kind: "sunrise" | "sunset" };
  const sunEvents: SunEvent[] = days.flatMap((d) => {
    const out: SunEvent[] = [];
    if (d.sunrise) {
      const ts = d.sunrise * 1000;
      if (ts >= dataStart && ts <= dataEnd)
        out.push({ ts, kind: "sunrise" });
    }
    if (d.sunset) {
      const ts = d.sunset * 1000;
      if (ts >= dataStart && ts <= dataEnd) out.push({ ts, kind: "sunset" });
    }
    return out;
  });

  // Tick the X axis every 3 hours, anchored to the data's hour
  // boundaries (don't trust Recharts' auto-tick algorithm — for ts
  // domains it picks unhelpful values). Hours are read in the
  // station's tz, not the viewer's — so a viewer outside the
  // station's zone still sees ticks aligned to forecast hours.
  const xTicks = data
    .filter((d) => {
      const h = Number(formatInTimeZone(new Date(d.ts), tz, "H"));
      return h % 3 === 0;
    })
    .map((d) => d.ts);

  // Gradient stops for the temperature line, keyed to absolute °F so
  // the same value always reads the same color. Stops outside the
  // visible domain get clamped to the nearest edge.
  const gradStops = [
    { t: 110, c: "var(--temp-extreme)" },
    { t: 95, c: "var(--temp-hot)" },
    { t: 80, c: "var(--temp-warm)" },
    { t: 65, c: "var(--temp-mild)" },
    { t: 50, c: "var(--temp-cool)" },
    { t: 38, c: "var(--temp-cold)" },
  ]
    .map(({ t, c }) => {
      const ratio = 1 - (t - minT) / (maxT - minT);
      return { offset: Math.max(0, Math.min(1, ratio)), color: c };
    })
    .sort((a, b) => a.offset - b.offset);

  const config = {
    tempF: { label: "Temperature", color: "var(--chart-1)" },
    feelsF: { label: "Feels like", color: "var(--chart-1)" },
    pop: { label: "Precipitation", color: "var(--chart-4)" },
    windAvgMph: { label: "Wind", color: "var(--status-muted)" },
    windGustMph: { label: "Gust", color: "var(--status-muted)" },
  } satisfies ChartConfig;

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <span>Next 24 hours</span>
        <span className="flex items-center gap-2 text-[10px] normal-case tracking-normal tabular">
          <span>
            {Math.round(minTRaw)}°–{Math.round(maxTRaw)}°F
          </span>
          {showWind && (
            <span className="text-muted-foreground/70">
              · gust to {Math.round(peakGust)} mph
            </span>
          )}
        </span>
      </div>
      <ChartContainer
        config={config}
        className="aspect-auto h-48 w-full"
      >
        <ComposedChart
          data={data}
          // Top margin reserves room for sunrise/sunset reference-line
          // labels that hang above the chart's grid via
          // `label.position: "top"`. Those labels are `fontSize: 9`,
          // so ~12px is enough vertical clearance.
          // Right margin is 4 (was 8) — the visible right "padding"
          // that the user noticed was almost entirely the wind YAxis
          // (`width: 44`); shrinking the axis below + dropping this
          // margin recovers another sliver of plot width.
          margin={{ top: 12, right: 4, bottom: 4, left: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              {gradStops.map((s, i) => (
                <stop
                  key={i}
                  offset={`${(s.offset * 100).toFixed(2)}%`}
                  stopColor={s.color}
                />
              ))}
            </linearGradient>
            <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--temp-line-fill)" />
              <stop
                offset="100%"
                stopColor="var(--temp-line-fill)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>

          <CartesianGrid
            vertical={false}
            stroke="var(--hairline-mid)"
            strokeDasharray="3 3"
          />

          <XAxis
            dataKey="ts"
            type="number"
            domain={[dataStart, dataEnd]}
            ticks={xTicks}
            tickFormatter={(ts: number) => {
              const h = Number(formatInTimeZone(new Date(ts), tz, "H"));
              return h === 0
                ? "12a"
                : h < 12
                  ? `${h}a`
                  : h === 12
                    ? "12p"
                    : `${h - 12}p`;
            }}
            tickLine={false}
            axisLine={{ stroke: "var(--hairline-strong)" }}
            tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          />

          <YAxis
            yAxisId="temp"
            domain={[minT, maxT]}
            tickCount={5}
            allowDecimals={false}
            tickFormatter={(v: number) => `${Math.round(v)}°`}
            tickLine={{ stroke: "var(--hairline-mid)" }}
            axisLine={{ stroke: "var(--hairline-strong)" }}
            // Width 32 fits "100°" / "110°" comfortably at fontSize 10
            // (4 chars including the degree glyph ≈ 28px) with a tiny
            // breath between tick labels and the chart line. Was 40,
            // which left obvious dead space at the chart's left edge.
            width={32}
            tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          />
          {/* Hidden secondary axis for the precip bar so it scales
              0-100% independently of the temperature axis.
              `orientation="right"` is load-bearing: hidden Y-axes are
              excluded from the left-offset calculation but still
              participate in same-side stacking. With the default left
              orientation, "precip" sorts before "temp" and snags the
              first left slot, shoving the visible temp axis off-canvas
              (labels render in the DOM but get clipped). Pinning
              `width={0}` keeps it from reserving space on the right. */}
          <YAxis
            yAxisId="precip"
            domain={[0, 100]}
            orientation="right"
            width={0}
            hide
          />
          {/* Visible wind axis on the right. Renders only when wind
              series are visible (typically always, since the layer's
              gate is "any wind data present"). Mirrors the temp axis's
              styling — same tick font/color, same hairline-mid tick
              line — so the two read as a paired left/right axis frame
              rather than two competing scales. The "mph" suffix sits
              on the topmost tick only to avoid stacking units on every
              tick label. */}
          {showWind && (
            <YAxis
              yAxisId="wind"
              domain={[0, windMax]}
              orientation="right"
              tickCount={4}
              allowDecimals={false}
              // Tick labels are bare numbers — the "mph" unit is
              // already disclosed in the header's "gust to N mph"
              // pill (rendered under the same `showWind` gate, so
              // the two are guaranteed to appear together). Dropping
              // the suffix on the top tick lets the axis width
              // shrink from 44 to 24, recovering ~20px of plot width
              // on every render.
              tickFormatter={(v: number) => `${Math.round(v)}`}
              tickLine={{ stroke: "var(--hairline-mid)" }}
              axisLine={{ stroke: "var(--hairline-strong)" }}
              width={24}
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
            />
          )}

          <ChartTooltip
            cursor={{
              stroke: "var(--primary)",
              strokeOpacity: 0.5,
              strokeDasharray: "3 3",
            }}
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              const get = (key: string) =>
                payload.find((p) => p.dataKey === key);
              const tempItem = get("tempF");
              const feelsItem = get("feelsF");
              const popItem = get("pop");
              const gustItem = get("windGustMph");
              const windItem = get("windAvgMph");
              const ts =
                typeof label === "number"
                  ? label
                  : typeof label === "string" && !Number.isNaN(Number(label))
                    ? Number(label)
                    : null;
              return (
                <div className="grid min-w-[160px] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                  {ts != null && (
                    <div className="border-b border-border/40 pb-1 font-medium tabular">
                      {formatClock(ts, tz)}
                    </div>
                  )}
                  {tempItem && typeof tempItem.value === "number" && (
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-[2px]"
                        style={{
                          // Mirror the chart's cool→warm gradient
                          // line so the swatch reads as the same
                          // temperature spectrum.
                          backgroundImage:
                            "linear-gradient(to right, var(--temp-cool), var(--temp-mild), var(--temp-warm))",
                        }}
                      />
                      <span className="text-muted-foreground">Temperature</span>
                      <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                        {Math.round(tempItem.value)}°F
                      </span>
                    </div>
                  )}
                  {showFeels &&
                    feelsItem &&
                    typeof feelsItem.value === "number" && (
                      <div className="flex items-center gap-2">
                        <span
                          // Same gradient as Temp at 65% opacity, mirroring
                          // the dashed feels-like line on the chart (same
                          // spectrum, ghosted behind the primary line).
                          className="size-2.5 shrink-0 rounded-[2px]"
                          style={{
                            backgroundImage:
                              "linear-gradient(to right, var(--temp-cool), var(--temp-mild), var(--temp-warm))",
                            opacity: 0.65,
                          }}
                          aria-hidden
                        />
                        <span className="text-muted-foreground">Feels like</span>
                        <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                          {Math.round(feelsItem.value)}°F
                        </span>
                      </div>
                    )}
                  {popItem &&
                    typeof popItem.value === "number" &&
                    popItem.value > 0 && (
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-[2px]"
                          style={{ backgroundColor: "var(--chart-4)" }}
                        />
                        <span className="text-muted-foreground">Precipitation</span>
                        <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                          {Math.round(popItem.value)}%
                        </span>
                      </div>
                    )}
                  {showWind &&
                    windItem &&
                    typeof windItem.value === "number" && (
                      <div className="flex items-center gap-2">
                        <span
                          // Faded gray rect — mirrors the wind avg
                          // area on the chart (fillOpacity 0.12).
                          // A full-opacity swatch would read as a
                          // different shade than the rendered band.
                          className="size-2.5 shrink-0 rounded-[2px]"
                          style={{
                            backgroundColor: "var(--status-muted)",
                            opacity: 0.55,
                          }}
                        />
                        <span className="text-muted-foreground">Wind</span>
                        <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                          {Math.round(windItem.value)} mph
                        </span>
                      </div>
                    )}
                  {showWind &&
                    gustItem &&
                    typeof gustItem.value === "number" && (
                      <div className="flex items-center gap-2">
                        {/* SVG swatch with a horizontal dashed line —
                            mirrors the chart's dashed gust line so
                            the cursor's third dot maps to a row with
                            an obviously distinct indicator (rather
                            than two near-identical gray squares). */}
                        <svg
                          width={10}
                          height={10}
                          viewBox="0 0 10 10"
                          aria-hidden
                          className="shrink-0"
                        >
                          <line
                            x1={0.5}
                            y1={5}
                            x2={9.5}
                            y2={5}
                            stroke="var(--status-muted)"
                            strokeWidth={1.5}
                            strokeDasharray="2 1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="text-muted-foreground">Gust</span>
                        <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                          {Math.round(gustItem.value)} mph
                        </span>
                      </div>
                    )}
                </div>
              );
            }}
          />

          {/* Wind layer (behind everything else) — area for the
              average, dashed line for peak gust. Both anchored to
              the hidden wind axis so they don't compete with the
              temperature scale. The muted slate fill keeps wind in
              its "secondary signal" lane and avoids fighting the
              temp gradient or the cool rain bars for attention. */}
          {showWind && (
            <Area
              yAxisId="wind"
              dataKey="windAvgMph"
              type="monotone"
              stroke="var(--status-muted)"
              strokeWidth={1}
              strokeOpacity={0.5}
              fill="var(--status-muted)"
              fillOpacity={0.12}
              isAnimationActive={false}
              connectNulls
            />
          )}
          {showWind && (
            <Line
              yAxisId="wind"
              dataKey="windGustMph"
              type="monotone"
              stroke="var(--status-muted)"
              strokeWidth={1.25}
              strokeOpacity={0.7}
              strokeDasharray="3 3"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}

          {/* Precip bars — only render if any hour has > 0% probability.
              Anchored to the hidden percent axis. `var(--chart-4)`
              is the same precip-blue token the tooltip swatch uses,
              so the chart, tooltip, and legend all render the same
              shade. (Earlier code referenced an undefined
              `--color-pop` which fell back to the SVG default
              black.) */}
          {hasPrecip && (
            <Bar
              dataKey="pop"
              yAxisId="precip"
              fill="var(--chart-4)"
              fillOpacity={0.7}
              radius={[2, 2, 0, 0]}
              maxBarSize={6}
            />
          )}

          {sunEvents.map((e) => (
            <ReferenceLine
              key={`${e.kind}-${e.ts}`}
              x={e.ts}
              yAxisId="temp"
              stroke={
                e.kind === "sunrise"
                  ? "var(--sunrise-marker)"
                  : "var(--sunset-marker)"
              }
              strokeOpacity={0.55}
              strokeDasharray="2 4"
              label={{
                value: `${e.kind === "sunrise" ? "↑" : "↓"} ${formatClock(e.ts, tz)}`,
                position: "top",
                fontSize: 9,
                fill: "var(--color-muted-foreground)",
              }}
            />
          ))}

          {/* Feels-like companion line. Same temp gradient stroke
              (so the color tells the story — "this is the heat
              you actually feel" tracks the real temperature spectrum)
              but thinner + dashed + 65% opacity so it reads as a
              ghost behind the air-temp line. Auto-hidden when the
              two track within 1°F across the window. */}
          {showFeels && (
            <Line
              yAxisId="temp"
              dataKey="feelsF"
              type="monotone"
              stroke={`url(#${gradientId})`}
              strokeWidth={1.5}
              strokeOpacity={0.65}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}

          {/* Single Area series doing both fill + stroke. `activeDot`
              styles the hover indicator (card-colored fill, copper
              stroke) so it reads cleanly against the gradient line. */}
          <Area
            yAxisId="temp"
            dataKey="tempF"
            type="monotone"
            stroke={`url(#${gradientId})`}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={`url(#${areaId})`}
            isAnimationActive={false}
            connectNulls
            activeDot={{
              r: 4,
              fill: "var(--card)",
              stroke: "var(--primary)",
              strokeWidth: 2,
            }}
          />
        </ComposedChart>
      </ChartContainer>

      {/* Legend — only shown when at least one secondary series is
          visible. With temperature alone the chart is self-evident
          and a single-item legend would just be noise. Each swatch
          mirrors the chart's actual rendering: gradient stroke for
          the temperature lines, faded fill for the wind area, etc.,
          so the legend reads as a true key.
          `justify-center` matches the StationHealth footer pattern —
          flex-wrap rows of small status/key items center as a group,
          so wrapped lines on mobile stay balanced rather than
          left-clustered. */}
      {(showFeels || hasPrecip || showWind) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          <LegendItem swatchKind="line" gradient label="Temp" />
          {showFeels && (
            <LegendItem swatchKind="line" gradient dashed label="Feels like" />
          )}
          {hasPrecip && (
            <LegendItem swatchKind="bar" color="var(--chart-4)" label="Precip %" />
          )}
          {showWind && (
            <LegendItem swatchKind="area" color="var(--status-muted)" label="Wind" />
          )}
          {showWind && (
            <LegendItem swatchKind="line" color="var(--status-muted)" dashed label="Gust" />
          )}
        </div>
      )}
    </Card>
  );
}

// `LegendItem` lives in `./ForecastHourlyLegend.tsx`. The swatch SVG
// logic is ~90 lines and isn't tied to the rest of this component.
