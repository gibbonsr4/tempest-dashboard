/**
 * TanStack hook for the Tempest station metadata. Cached for 24 h —
 * lat/lon/timezone don't change unless the user moves their station.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOrThrow } from "./_fetch";

export interface StationMeta {
  stationId: number;
  stationName: string;
  latitude: number;
  longitude: number;
  timezone: string | null;
  /** Primary "ST" device id used for the rapid-wind WS subscription. */
  deviceId: number | null;
  /** ST device firmware revision (e.g. "156"). */
  firmware: string | null;
  /** ST device hardware revision. */
  hardware: string | null;
  /** Station elevation in meters, when reported. */
  elevationM: number | null;
}

const fetchStationMeta = () =>
  fetchOrThrow<StationMeta>("/api/tempest/stations", "stations");

export function useStationMeta() {
  return useQuery({
    queryKey: ["tempest", "stations"],
    queryFn: fetchStationMeta,
    staleTime: 24 * 60 * 60_000,
  });
}
