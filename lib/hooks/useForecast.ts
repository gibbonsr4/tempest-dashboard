/**
 * TanStack hook for the better_forecast payload — current_conditions +
 * 10-day daily + ~240-hour hourly. Refetches every 10 min which
 * matches the upstream model cadence and the proxy cache TTL.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOrThrow } from "./_fetch";
import type { ForecastResponse } from "@/lib/tempest/types";

const fetchForecast = () =>
  fetchOrThrow<ForecastResponse>("/api/tempest/forecast", "forecast");

export function useForecast() {
  return useQuery({
    queryKey: ["tempest", "forecast"],
    queryFn: fetchForecast,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}
