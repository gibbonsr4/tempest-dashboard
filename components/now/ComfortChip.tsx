"use client";

import { Badge } from "@/components/ui/badge";

/**
 * Small chip beneath the hero presenting the current conditions phrase.
 * The phrase comes from `interpret.conditionsPhrase` — a pure rule
 * over temp / humidity / UV / wind. Deterministic, no AI.
 */
export function ComfortChip({ phrase }: { phrase: string }) {
  return (
    <Badge
      variant="outline"
      className="w-fit border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-foreground"
    >
      {phrase}
    </Badge>
  );
}
