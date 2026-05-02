/**
 * GET /api/tempest/forecast
 *
 * Wraps WeatherFlow's better_forecast endpoint. The proxy passes the
 * full payload through (current_conditions + forecast.daily +
 * forecast.hourly) so the client can compose multiple views from a
 * single fetch.
 */

import { NextResponse } from "next/server";
import {
  getBetterForecast,
  resolveConfiguredStation,
  tempestErrorResponse,
} from "@/lib/tempest/server-client";

export async function GET() {
  try {
    const { station } = await resolveConfiguredStation();
    const data = await getBetterForecast(station.station_id);
    return NextResponse.json(data);
  } catch (err) {
    return tempestErrorResponse(err);
  }
}
