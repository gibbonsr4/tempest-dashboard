/**
 * TanStack hook for the latest station observation. Polls every 30s
 * which matches the Route Handler's revalidate cadence — the network
 * call is essentially free after the first hit each window.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOrThrow } from "./_fetch";
import type { StationObs } from "@/lib/tempest/types";

export interface CurrentObsPayload {
  /** The single most recent observation flattened from `obs[0]`. */
  obs: StationObs;
  /** Station name, lat, lon, timezone — useful for display chrome. */
  stationName: string;
  latitude: number;
  longitude: number;
  timezone: string | null;
  /** epoch ms — when the server proxied this fetch. */
  fetchedAt: number;
}

const fetchObs = () =>
  fetchOrThrow<CurrentObsPayload>("/api/tempest/observations", "observations");

export function useStationObs() {
  return useQuery({
    queryKey: ["tempest", "obs"],
    queryFn: fetchObs,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
