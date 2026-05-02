/**
 * Server-side fetch for the EPA AirNow API. The key lives in
 * `process.env.AIRNOW_API_KEY` and never reaches the browser.
 *
 * AirNow returns an array of {ParameterName, AQI, Category} per pollutant.
 * The route handler condenses to a single "dominant" reading (the highest
 * AQI value across pollutants), which is what the UI tile renders.
 *
 * SECURITY NOTE — the AirNow API only accepts the key as the
 * `API_KEY` querystring parameter; their endpoints don't support
 * `Authorization: Bearer` or any header-based auth, so we can't move
 * it out of the URL even though querystring secrets are
 * conventionally less hygienic than headers. The mitigations:
 *
 *   1. The fetch only ever runs server-side (Route Handler →
 *      `getCurrentAqi`). The key never reaches the browser, the
 *      bundled JS, or HTML.
 *   2. The URL with the key only appears in two log surfaces — our
 *      Cloudflare Worker's outbound fetch logs (which are off by
 *      default in production and only enabled for `wrangler tail`)
 *      and AirNow's own server logs (out of our control regardless).
 *   3. The route handler caches at 1h via `revalidate`, so the key
 *      is sent at most ~24× per day per Worker instance.
 *
 * If AirNow ever ships a header-auth option, swap to it and drop the
 * `API_KEY` querystring parameter.
 */

import { airnowResponse, type AirnowResponse } from "./schemas";

const BASE = "https://www.airnowapi.org";

/**
 * GET /aq/observation/latLong/current — current AQI observations for
 * the nearest monitor within 25 mi. Cached 1h.
 */
export async function getCurrentAqi(
  lat: number,
  lon: number,
): Promise<AirnowResponse> {
  const key = process.env.AIRNOW_API_KEY;
  if (!key) throw new Error("AIRNOW_API_KEY not configured");

  // See the file-level note: AirNow only accepts the key via the
  // `API_KEY` query parameter; this is not an oversight, header auth
  // isn't an option upstream.
  const url =
    `${BASE}/aq/observation/latLong/current/` +
    `?format=application/json` +
    `&latitude=${lat.toFixed(4)}` +
    `&longitude=${lon.toFixed(4)}` +
    `&distance=25` +
    `&API_KEY=${encodeURIComponent(key)}`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`AirNow ${res.status}`);
  }
  const json = await res.json();
  return airnowResponse.parse(json);
}
