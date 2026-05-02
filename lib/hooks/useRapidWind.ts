/**
 * Convenience selectors over the Zustand rapid-wind buffer. Subscribers
 * use these instead of selecting raw state so React only re-renders on
 * the slice they care about.
 */

"use client";

import { useShallow } from "zustand/react/shallow";
import { selectLatestWind, useApp } from "@/lib/store";
import type { WindSample } from "@/lib/tempest/types";

/** Latest sample, or null if no data yet. */
export function useLatestWind(): WindSample | null {
  return useApp(selectLatestWind);
}

/** Full rolling buffer for the gauge sparkline. */
export function useWindBuffer(): WindSample[] {
  return useApp(useShallow((s) => s.rapidWind));
}
