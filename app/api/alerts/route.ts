/**
 * GET /api/alerts
 *
 * NWS active alerts for the station's lat/lon. The route resolves
 * lat/lon from the configured Tempest station meta (cached station
 * fetch — already 24h-cached) so the user doesn't have to configure
 * it twice.
 *
 * Stations clearly outside NWS coverage short-circuit to an empty
 * FeatureCollection without hitting api.weather.gov — see
 * `isInNwsCoverage` for the rationale + bounding boxes. The empty
 * shape matches the success envelope so the client `<AlertsBanner />`
 * (which already early-returns on `features.length === 0`) needs no
 * special handling.
 */

import { NextResponse } from "next/server";
import { getActiveAlerts, isInNwsCoverage } from "@/lib/nws/server-client";
import type { AlertsFeatureCollection } from "@/lib/nws/schemas";
import {
  resolveConfiguredStation,
  tempestErrorResponse,
} from "@/lib/tempest/server-client";

export async function GET() {
  try {
    const { station } = await resolveConfiguredStation();
    if (!isInNwsCoverage(station.latitude, station.longitude)) {
      const empty: AlertsFeatureCollection = {
        type: "FeatureCollection",
        features: [],
      };
      return NextResponse.json(empty);
    }
    const alerts = await getActiveAlerts(station.latitude, station.longitude);
    return NextResponse.json(alerts);
  } catch (err) {
    return tempestErrorResponse(err);
  }
}
