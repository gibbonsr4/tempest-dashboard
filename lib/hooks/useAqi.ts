/**
 * TanStack hook for AirNow AQI. The proxy condenses the per-pollutant
 * array into a single dominant reading; this hook just transports.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOrThrow } from "./_fetch";

export interface AqiPayload {
  /** Highest-AQI value across the available pollutants for the area. */
  aqi: number | null;
  /** Pollutant name driving the reading (e.g. "O3", "PM2.5"). */
  pollutant: string | null;
  /** EPA category label provided by AirNow. */
  category: string | null;
  /** Reporting area (closest city / CBSA). */
  reportingArea: string | null;
  /** True when AirNow returned no data (no nearby monitor). */
  noMonitor: boolean;
}

const fetchAqi = () => fetchOrThrow<AqiPayload>("/api/aqi", "aqi");

export function useAqi() {
  return useQuery({
    queryKey: ["airnow", "aqi"],
    queryFn: fetchAqi,
    staleTime: 60 * 60_000,
    refetchInterval: 60 * 60_000,
  });
}
