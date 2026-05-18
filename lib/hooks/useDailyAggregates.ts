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
  before: number;
  tz: string | null;
  count: number;
  aggregates: DeviceDailyAggregate[];
}

export type { DeviceDailyAggregate };

const fetchAggregates = (days: number, before: number) =>
  fetchOrThrow<DailyAggregatesPayload>(
    `/api/tempest/aggregates?days=${days}&before=${before}`,
    "aggregates",
  );

/**
 * Fetch `days` of daily-aggregate rows for the configured station,
 * with the window ending `before` days ago (default 0 = ending now).
 * Server clamps `days` to [181, 730]; combined `before + days` capped
 * at 2 * 730 = 1460. `before` is the same offset semantic as on
 * /api/tempest/history — `useDailyAggregates(365, 365)` returns the
 * daily window that ENDED 365 days ago, the input the 12mo
 * "vs previous 12 months" compare-overlay path wants.
 *
 * Returns the response shape: aggregates array + tz_name +
 * device_id. The aggregates array is in chronological order
 * (oldest first); for `before=0` the most recent row is today's
 * partial data, for `before>0` the most recent row is the final
 * day of the historical window.
 */
export function useDailyAggregates(
  days = 365,
  before = 0,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["tempest-aggregates", days, before],
    queryFn: () => fetchAggregates(days, before),
    // 6 hours — matches the server-side cache TTL on the route.
    staleTime: 6 * 60 * 60 * 1000,
    enabled: options.enabled ?? true,
  });
}
