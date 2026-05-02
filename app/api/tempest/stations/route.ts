/**
 * GET /api/tempest/stations
 *
 * Returns the lean station-meta payload the dashboard actually consumes:
 * id, name, lat/lon, tz, and the primary device id used for the WS
 * subscription. Holds the API token server-side; the browser never sees
 * the raw `stations` envelope.
 *
 * Station resolution lives in `resolveConfiguredStation()` — it fails
 * closed when `TEMPEST_STATION_ID` is unset or unmatched, so a bad
 * deploy surfaces a clear error instead of silently returning someone
 * else's station.
 */

import { NextResponse } from "next/server";
import {
  resolveConfiguredStation,
  tempestErrorResponse,
} from "@/lib/tempest/server-client";

export async function GET() {
  try {
    const { station, device } = await resolveConfiguredStation();
    return NextResponse.json({
      stationId: station.station_id,
      stationName: station.public_name ?? station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      timezone: station.timezone ?? null,
      deviceId: device.device_id,
      // Hardware/firmware surface for the StationHealth footer.
      // `firmware_revision` can come back as a string or number per
      // the Tempest schema; we coerce to string for display.
      firmware:
        device.firmware_revision != null
          ? String(device.firmware_revision)
          : null,
      hardware:
        device.hardware_revision != null
          ? String(device.hardware_revision)
          : null,
      elevationM: station.station_meta?.elevation ?? null,
    });
  } catch (err) {
    return tempestErrorResponse(err);
  }
}
