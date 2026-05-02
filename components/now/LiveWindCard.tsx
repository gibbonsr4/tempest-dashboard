"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { beaufort, cardinal, mpsToMph } from "@/lib/tempest/conversions";
import type { StationObs } from "@/lib/tempest/types";
import { RapidWindGauge } from "./RapidWindGauge";
import { WindForceIcon } from "./WindForceIcon";

/**
 * Wind card laid out like a console gauge: the dial sits in the
 * center, supporting stats hug the gauge along the left and right
 * columns. Side columns use `justify-between` so the top stat aligns
 * with the gauge's top edge and the bottom stat aligns with the
 * gauge's bottom edge — no absolute positioning, no extra height.
 *
 *   ┌──────────────────────────────┐
 *   │  Avg     [   gauge   ]  Gust │
 *   │           1.1 mph NE         │
 *   │           [sparkline]        │
 *   │  Lull                  ≡≡≡   │
 *   │                        N 12° │
 *   └──────────────────────────────┘
 *
 * Beaufort is rendered as a 5-bar wind-force indicator rather than a
 * literal "F1 · Light air" label so it reads at a glance without
 * Beaufort-scale literacy.
 */
export function LiveWindCard({ obs }: { obs: StationObs | null }) {
  const avgMps = obs?.wind_avg ?? null;
  const gustMps = obs?.wind_gust ?? null;
  const lullMps = obs?.wind_lull ?? null;
  const dirDeg = obs?.wind_direction ?? null;

  const avgMph = avgMps != null ? mpsToMph(avgMps) : null;
  const gustMph = gustMps != null ? mpsToMph(gustMps) : null;
  const lullMph = lullMps != null ? mpsToMph(lullMps) : null;

  const bf = avgMph != null ? beaufort(avgMph) : { level: 0, name: "Calm" };
  const cardinalLabel = dirDeg != null ? cardinal(dirDeg) : null;

  return (
    <Card className="p-5">
      {/* flex-1 makes this row stretch to the full card height when the
          row stretches (matching the hero card's height) — that lets
          the side columns' justify-between push Lull / wind-force down
          to align with the hero's sunrise / sunset footer. */}
      <div className="flex flex-1 items-stretch gap-3">
        <div className="flex flex-col justify-between py-1">
          <Stat label="Avg" value={avgMph} unit="mph" align="left" />
          <Stat label="Lull" value={lullMph} unit="mph" align="left" />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-1">
          <RapidWindGauge size={200} />
        </div>

        <div className="flex flex-col items-end justify-between py-1">
          <Stat label="Gust" value={gustMph} unit="mph" align="right" accent />
          <div className="flex flex-col items-end gap-1">
            <WindForceIcon level={bf.level} name={bf.name} />
            {cardinalLabel && dirDeg != null && (
              <span className="tabular text-[10px] text-muted-foreground">
                {cardinalLabel} {Math.round(dirDeg)}°
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  unit,
  align,
  accent = false,
}: {
  label: string;
  value: number | null;
  unit: string;
  align: "left" | "right";
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col leading-tight",
        align === "right" ? "items-end text-right" : "items-start text-left",
      )}
    >
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span
          className={cn(
            "tabular text-xl font-medium",
            accent ? "text-primary" : "text-foreground",
          )}
        >
          {value != null ? value.toFixed(1) : "—"}
        </span>
        <span className="text-[10px] text-muted-foreground">{unit}</span>
      </span>
    </div>
  );
}
