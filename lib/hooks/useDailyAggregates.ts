/**
 * TanStack hook for the long-window daily-aggregate payload that
 * powers History-tab views at 90d / YTD / 1y range and the Now-tab
 * Year-to-date tiles.
 *
 * Distinct from `useRecentHistory(hours)` which serves the ≤30-day
 * sub-daily charts. The two return different shapes:
 *
 *   - `useRecentHistory` → `HistorySample[]` with sub-daily cadence
 *   - `useDailyAggregates` → `DeviceDailyAggregate[]` with one row
 *     per calendar day (station-local tz)
 *
 * Backed by the /api/tempest/aggregates endpoint. Refetches every
 * 6 hours — daily aggregates only meaningfully change at station-
 * local midnight (when yesterday's row finalizes) and the partial
 * "today" row updates ~minutely on the server side. Aligning the
 * client refetch with the server cache TTL keeps things tidy.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import type { DeviceDailyAggregate } from "@/lib/tempest/server-client";
import { fetchOrThrow } from "./_fetch";

interface DailyAggregatesPayload {
  deviceId: number;
  days: number;
  tz: string | null;
  count: number;
  aggregates: DeviceDailyAggregate[];
}

export type { DeviceDailyAggregate };

const fetchAggregates = (days: number) =>
  fetchOrThrow<DailyAggregatesPayload>(
    `/api/tempest/aggregates?days=${days}`,
    "aggregates",
  );

/**
 * Fetch up to `days` of daily-aggregate rows for the configured
 * station. `days` is clamped server-side to [181, 730].
 *
 * Returns the response shape: aggregates array + tz_name +
 * device_id. The aggregates array is in chronological order
 * (oldest first), with the most recent row being today's partial
 * data.
 */
export function useDailyAggregates(
  days = 365,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["tempest-aggregates", days],
    queryFn: () => fetchAggregates(days),
    // 6 hours — matches the server-side cache TTL on the route.
    staleTime: 6 * 60 * 60 * 1000,
    enabled: options.enabled ?? true,
  });
}
