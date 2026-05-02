"use client";

import { useNow } from "@/lib/hooks/useNow";
import { formatClock, formatDateShort } from "@/lib/tempest/format";
import { useStationTz } from "@/lib/tempest/tz-context";
import { cn } from "@/lib/utils";

/**
 * Live wall-clock display rendered in the station's tz. The date is
 * shown next to the time so the user always sees the dashboard's
 * frame of reference at a glance.
 *
 * Updates once per minute via the shared `useNow` hook.
 */
export function Clock({ className }: { className?: string }) {
  const now = useNow();
  const tz = useStationTz();
  return (
    <span
      className={cn(
        "inline-flex flex-col items-end leading-tight tabular",
        className,
      )}
    >
      <span className="text-sm font-medium text-foreground">
        {formatClock(now, tz)}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {formatDateShort(now, tz)}
      </span>
    </span>
  );
}
