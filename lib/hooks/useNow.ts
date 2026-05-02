/**
 * Hook returning a "current time" epoch ms that updates on a fixed
 * cadence. Used by components that render relative times ("3 min ago",
 * "daylight 5h 14m left") so the displayed value stays correct as time
 * passes — and so React doesn't see an impure `Date.now()` call inside
 * a render path.
 */

"use client";

import * as React from "react";

export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
