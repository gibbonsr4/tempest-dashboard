/**
 * GET /api/tempest/observations
 *
 * Returns the latest station observation alongside the station-level
 * lat/lon/tz so the client can avoid a second call when it already has
 * everything it needs to render the Now hero.
 */

import { NextResponse } from "next/server";
import {
  getStationObservations,
  resolveConfiguredStation,
  tempestErrorResponse,
} from "@/lib/tempest/server-client";

export async function GET() {
  try {
    const { station } = await resolveConfiguredStation();
    const data = await getStationObservations(station.station_id);
    const obs = data.obs[0];
    if (!obs) {
      return NextResponse.json({ error: "no observations" }, { status: 502 });
    }
    return NextResponse.json({
      obs,
      stationName: data.station_name ?? station.public_name ?? station.name,
      latitude: data.latitude ?? station.latitude,
      longitude: data.longitude ?? station.longitude,
      timezone: data.timezone ?? station.timezone ?? null,
      fetchedAt: Date.now(),
    });
  } catch (err) {
    return tempestErrorResponse(err);
  }
}
