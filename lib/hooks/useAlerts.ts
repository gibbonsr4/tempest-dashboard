/**
 * TanStack hook for active NWS alerts. Refetches every 5 min — same as
 * the upstream proxy's revalidate cadence.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOrThrow } from "./_fetch";
import type { AlertsFeatureCollection } from "@/lib/nws/schemas";

const fetchAlerts = () =>
  fetchOrThrow<AlertsFeatureCollection>("/api/alerts", "alerts");

export function useAlerts() {
  return useQuery({
    queryKey: ["nws", "alerts"],
    queryFn: fetchAlerts,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
