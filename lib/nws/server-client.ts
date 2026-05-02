/**
 * Server-side fetch for NWS active alerts. NWS requires a User-Agent
 * identifying the consumer + a contact method, otherwise it returns
 * 403 Forbidden. The UA is read from `process.env.NWS_USER_AGENT`.
 */

import { alertsFeatureCollection, type AlertsFeatureCollection } from "./schemas";

const BASE = "https://api.weather.gov";

function userAgent(): string {
  const ua = process.env.NWS_USER_AGENT;
  if (ua && ua.trim().length > 0) return ua;
  // Self-describing fallback: NWS still accepts the request, but anyone
  // tracing logs (theirs or ours) can see at a glance that the deploy
  // never set NWS_USER_AGENT. Per NWS TOS, public-facing deployments
  // should provide a real contact method.
  return "tempest-dashboard (please set NWS_USER_AGENT to your contact info)";
}

/**
 * Coarse "is this point inside NWS coverage" check. NWS only issues
 * alerts for US states + territories + their adjacent maritime zones;
 * any other point returns an empty `features` array (or, occasionally,
 * an error). Skipping the upstream fetch for clearly-non-US stations
 * saves a roundtrip per 5-min polling cycle and keeps server logs
 * quiet for international deploys.
 *
 * The bounding boxes are intentionally GENEROUS — they include slices
 * of Canada, Mexico, and the Caribbean near the US border:
 *   1. NWS sometimes issues alerts whose polygons cross those borders
 *      (winter weather, marine forecasts), and a station right at
 *      the line might legitimately receive them.
 *   2. The cost of a stray empty-result fetch is small; the cost of
 *      incorrectly suppressing a real alert near the border is large.
 *
 * Stations clearly outside (Europe, Asia, most of Africa, Oceania
 * outside US territories, mainland South America) are filtered out.
 */
export function isInNwsCoverage(lat: number, lon: number): boolean {
  // CONUS (generous — catches Canadian/Mexican border zones)
  if (lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66) return true;
  // Alaska (mainland + Aleutians; the chain stops well before the
  // antimeridian on the east side, so a single -180 → -129 box is enough)
  if (lat >= 51 && lat <= 72 && lon >= -180 && lon <= -129) return true;
  // Hawaii
  if (lat >= 18 && lat <= 23 && lon >= -161 && lon <= -154) return true;
  // Puerto Rico / US Virgin Islands
  if (lat >= 17 && lat <= 19 && lon >= -68 && lon <= -64) return true;
  // Guam / CNMI / Wake — all sit between ~13°N and 21°N around 140-170°E
  if (lat >= 13 && lat <= 21 && lon >= 140 && lon <= 170) return true;
  // American Samoa
  if (lat >= -15 && lat <= -10 && lon >= -171 && lon <= -169) return true;
  return false;
}

/**
 * GET /alerts/active?point={lat},{lon} — every active alert that
 * geographically covers the given point. NWS responses are GeoJSON.
 */
export async function getActiveAlerts(
  lat: number,
  lon: number,
): Promise<AlertsFeatureCollection> {
  const url = `${BASE}/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent(),
      Accept: "application/geo+json",
    },
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(`NWS alerts ${res.status}`);
  }
  const json = await res.json();
  return alertsFeatureCollection.parse(json);
}
