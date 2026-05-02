/**
 * GET /api/aqi
 *
 * EPA AirNow current AQI for the station's lat/lon. Condenses the
 * AirNow per-pollutant array into a single dominant reading (max AQI
 * across pollutants) since the UI tile only has room for one number.
 *
 * When AirNow has no monitor within 25 mi the response array is empty;
 * the route returns `{ noMonitor: true, ... }` so the UI can render
 * an honest empty state.
 */

import { NextResponse } from "next/server";
import { getCurrentAqi } from "@/lib/airnow/server-client";
import {
  resolveConfiguredStation,
  tempestErrorResponse,
} from "@/lib/tempest/server-client";

export async function GET() {
  try {
    const { station } = await resolveConfiguredStation();
    const observations = await getCurrentAqi(
      station.latitude,
      station.longitude,
    );

    if (observations.length === 0) {
      return NextResponse.json({
        aqi: null,
        pollutant: null,
        category: null,
        reportingArea: null,
        noMonitor: true,
      });
    }

    // Pick the highest-AQI reading across pollutants — that's the EPA
    // "dominant pollutant" rule and what the headline AQI represents.
    const dominant = observations.reduce((best, cur) => {
      const a = cur.AQI ?? -1;
      const b = best.AQI ?? -1;
      return a > b ? cur : best;
    });

    return NextResponse.json({
      aqi: dominant.AQI ?? null,
      pollutant: dominant.ParameterName,
      category: dominant.Category?.Name ?? null,
      reportingArea: dominant.ReportingArea ?? null,
      noMonitor: false,
    });
  } catch (err) {
    return tempestErrorResponse(err);
  }
}
