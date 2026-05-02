/**
 * TanStack hook for the rolling-history payload that powers the
 * Now-tab metric sparklines. Refetches every 5 min — same as the
 * proxy's revalidate cadence — so a user leaving the page open sees
 * the sparkline tail extend organically over a session.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOrThrow } from "./_fetch";

export interface HistorySample {
  ts: number;
  windAvgMps: number | null;
  windGustMps: number | null;
  windDirDeg: number | null;
  pressureMb: number | null;
  tempC: number | null;
  humidityPct: number | null;
  uv: number | null;
  solarWm2: number | null;
  rainMm: number | null;
  batteryV: number | null;
  lightningStrikeCount: number | null;
}

export interface HistoryPayload {
  deviceId: number;
  hours: number;
  buckets: number;
  samples: HistorySample[];
}

const fetchHistory = (hours: number, before: number) =>
  fetchOrThrow<HistoryPayload>(
    `/api/tempest/history?hours=${hours}&before=${before}`,
    "history",
  );

/**
 * `before` is the offset in hours to subtract from the window's end —
 * `useRecentHistory(168, 168)` gives the 7 days that ended 7 days ago,
 * which is what the History tab's compare overlay wants. Pass
 * `{ enabled: false }` to skip the fetch entirely.
 */
export function useRecentHistory(
  hours = 24,
  before = 0,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["tempest", "history", hours, before],
    queryFn: () => fetchHistory(hours, before),
    staleTime: 5 * 60_000,
    // Only the live window auto-refreshes; the compare window is
    // fixed in the past and never needs background polling.
    refetchInterval: before === 0 ? 5 * 60_000 : false,
    enabled: options.enabled !== false,
  });
}
