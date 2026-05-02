/**
 * Server-side fetch wrapper for the WeatherFlow Tempest REST API.
 *
 * Runs in Route Handlers under the Cloudflare Node.js runtime (the
 * OpenNext adapter bundles routes for `nodejs_compat` — declaring
 * `runtime = "edge"` would surface as `interopDefault` failures at
 * worker startup, see AGENTS.md). Holds the personal access token
 * (read from `process.env.TEMPEST_TOKEN`) and applies the
 * cache-revalidation cadence per endpoint. Validates every response
 * with a Zod schema at the boundary.
 */

import { z, type ZodType } from "zod";
import {
  forecastResponse,
  stationObservationsResponse,
  stationsResponse,
  type Device,
  type ForecastResponse,
  type Station,
  type StationObservationsResponse,
} from "./schemas";

const BASE = "https://swd.weatherflow.com/swd/rest";

export class TempestApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusMessage?: string,
  ) {
    super(`Tempest API ${status}${statusMessage ? `: ${statusMessage}` : ""}`);
    this.name = "TempestApiError";
  }
}

/**
 * Normalize any thrown error into a Next response. Keeps Route Handlers
 * uniform so they don't each reinvent the same try/catch shape.
 *
 * Status mapping:
 *   401          → 401 (auth — clarify token)
 *   404 / 500    → propagate (configuration errors live here)
 *   anything else from Tempest → 502 (upstream bad gateway)
 *   non-Tempest  → 500 (something else broke)
 *
 * SECURITY: in production, we expose only a generic message + the
 * `code` from `TempestApiError` so we don't leak Zod schema paths,
 * upstream `status_message` strings, or internal exception text to
 * arbitrary clients. The full error is logged server-side via
 * `console.error` so Workers logs / wrangler tail still see it.
 * In development we keep the verbose message inline for fast iteration.
 *
 * `extractConfigError` in NowClient still works because the friendly-
 * UX strings it cares about ("`TEMPEST_TOKEN not configured`",
 * `'No Tempest "ST" device on station N'`) are produced as 500s with a
 * stable `code` we now also forward as the message in dev/prod.
 */
export function tempestErrorResponse(err: unknown): Response {
  const isProd = process.env.NODE_ENV === "production";

  if (err instanceof TempestApiError) {
    const status =
      err.status === 401 || err.status === 404 || err.status === 500
        ? err.status
        : 502;
    // Always log the full message server-side for observability.
    console.error("[tempest]", status, err.message);
    // 401 / 404 / 500 are config-tier errors (token missing, station
    // not found, ST device not found, invalid token) that originate
    // from our own throws or Tempest's own structured error envelope
    // — NowClient's `extractConfigError` matches on these strings to
    // render the friendly Setup UI, so they pass through verbatim.
    // 502 (mapped from arbitrary Tempest 5xx) gets sanitized in
    // production — these can carry unpredictable upstream detail.
    const safeMessage =
      status === 502 && isProd ? statusToGenericMessage(502) : err.message;
    return Response.json({ error: safeMessage }, { status });
  }
  // Non-TempestApiError — usually a Zod parse failure or a network
  // hiccup. Log the detail server-side, return a generic message.
  console.error("[tempest] non-api error:", err);
  return Response.json(
    {
      error: isProd
        ? "internal server error"
        : err instanceof Error
          ? err.message
          : "unknown error",
    },
    { status: 500 },
  );
}

function statusToGenericMessage(status: number): string {
  switch (status) {
    case 401:
      return "tempest authentication failed";
    case 404:
      return "tempest resource not found";
    case 502:
      return "tempest upstream error";
    default:
      return "tempest request failed";
  }
}

/**
 * Internal: token-bearing fetch with edge cache integration. The
 * `revalidate` value is the per-endpoint TTL in seconds.
 */
async function tempestFetch<T>(
  path: string,
  schema: ZodType<T>,
  revalidate: number,
): Promise<T> {
  const token = process.env.TEMPEST_TOKEN;
  if (!token) throw new TempestApiError(500, "TEMPEST_TOKEN not configured");

  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate },
  });

  if (!res.ok) {
    // Tempest sometimes returns a structured error envelope; pluck its
    // status_message if available. When the body isn't JSON (HTML error
    // page, empty 502, etc.) we fall back to a short text excerpt and
    // `res.statusText` so the server-side log line is at least
    // actionable. The thrown `TempestApiError` carries only the
    // sanitizable status_message — the raw body excerpt stays in the
    // server log via `console.warn`.
    type ErrorEnvelope = { status?: { status_message?: string } };
    let envelope: ErrorEnvelope = {};
    try {
      envelope = (await res.clone().json()) as ErrorEnvelope;
    } catch {
      const excerpt = await res
        .text()
        .then((t) => t.slice(0, 200))
        .catch(() => "<unreadable body>");
      console.warn(
        `[tempest] non-JSON error body (${res.status} ${res.statusText}):`,
        excerpt,
      );
    }
    throw new TempestApiError(
      res.status,
      envelope?.status?.status_message ?? res.statusText,
    );
  }

  const json = await res.json();
  return schema.parse(json);
}

/**
 * GET /stations — discover station + device metadata. Cached for a day
 * because device IDs and lat/lon don't change often.
 */
export async function getStations() {
  return tempestFetch("/stations", stationsResponse, 86_400);
}

/**
 * Resolve the configured station + its primary "ST" Tempest device
 * from the env var `TEMPEST_STATION_ID`. This is the single source of
 * truth for station/device resolution across every Route Handler.
 *
 * Fail-closed by design — no `stations[0]` fallback when the configured
 * id isn't found, because in a public/self-hosted release that fallback
 * would silently surface someone else's station's data.
 */
export async function resolveConfiguredStation(): Promise<{
  station: Station;
  device: Device;
}> {
  const raw = process.env.TEMPEST_STATION_ID;
  if (!raw || raw.trim() === "") {
    throw new TempestApiError(500, "TEMPEST_STATION_ID not configured");
  }
  const stationId = Number(raw);
  if (!Number.isFinite(stationId) || stationId <= 0) {
    throw new TempestApiError(500, `TEMPEST_STATION_ID is not a valid number: ${raw}`);
  }
  const data = await getStations();
  const station = data.stations.find((s) => s.station_id === stationId);
  if (!station) {
    throw new TempestApiError(
      404,
      `Station ${stationId} not found in your Tempest account`,
    );
  }
  // Fail-closed: only the "ST" Tempest device exposes the rapid-wind
  // feed and the obs/forecast surfaces this dashboard expects. Falling
  // back to `devices[0]` would silently bind a future multi-device
  // station to whatever happened to be first in the array — exactly
  // the silent-fallback shape this fail-closed branch is meant to
  // prevent.
  const device = station.devices?.find((d) => d.device_type === "ST");
  if (!device) {
    throw new TempestApiError(
      404,
      `No Tempest "ST" device on station ${stationId}`,
    );
  }
  return { station, device };
}

/**
 * GET /observations/station/{id} — current conditions for the station.
 * Cached for 30 seconds (Tempest itself updates every minute).
 */
export async function getStationObservations(
  stationId: number,
): Promise<StationObservationsResponse> {
  return tempestFetch(
    `/observations/station/${stationId}`,
    stationObservationsResponse,
    30,
  );
}

/**
 * GET /better_forecast — current_conditions + 10-day daily +
 * ~240-hour hourly. Cached for 10 minutes; the upstream model itself
 * updates every ~10–15 min.
 */
export async function getBetterForecast(
  stationId: number,
): Promise<ForecastResponse> {
  return tempestFetch(
    `/better_forecast?station_id=${stationId}`,
    forecastResponse,
    600,
  );
}

/**
 * Tempest "ST" device observation row — positional column index for the
 * fields this dashboard consumes. Tempest's full row has 18 columns
 * (0..17); we only project the ones we actually surface. The omitted
 * columns (windLull, windSampleInterval, illuminanceLux, precipType,
 * lightningStrikeAvgDistance, reportIntervalMin) had no consumers and
 * were dropped to keep the index honest about what's surfaced.
 *
 * Full row format:
 * https://weatherflow.github.io/Tempest/api/swagger/#!/observations/getObservationsByDeviceId
 */
const ST_INDEX = {
  ts: 0,
  windAvgMps: 2,
  windGustMps: 3,
  windDirDeg: 4,
  stationPressureMb: 6,
  tempC: 7,
  humidityPct: 8,
  uv: 10,
  solarRadiationWm2: 11,
  rainAccumulatedMm: 12,
  lightningStrikeCount: 15,
  batteryV: 16,
} as const;

const deviceObsResponse = z.object({
  device_id: z.number(),
  type: z.string().optional(),
  bucket_step_minutes: z.number().nullable().optional(),
  // Tempest sometimes returns `null` for `obs` when the requested
  // window has no data (e.g. station outage, future timestamp, very
  // sparse history). Accept it and normalize to `[]` downstream.
  obs: z.array(z.array(z.number().nullable())).nullable(),
  status: z
    .object({
      status_code: z.number(),
      status_message: z.string().optional(),
    })
    .optional(),
});

export interface DeviceObsSample {
  ts: number; // epoch ms
  windAvgMps: number | null;
  windGustMps: number | null;
  windDirDeg: number | null;
  pressureMb: number | null;
  tempC: number | null;
  humidityPct: number | null;
  uv: number | null;
  solarWm2: number | null;
  rainMm: number | null;
  /** Battery voltage in volts (Tempest spec ~2.4 V is low). */
  batteryV: number | null;
  /** Total lightning strikes detected during this bucket. */
  lightningStrikeCount: number | null;
}

/**
 * GET /observations/device/{deviceId}?time_start=&time_end= — historical
 * raw device observations. Cached 5 min at the proxy.
 *
 * Tempest reports raw obs every minute by default, so a 24-hour window
 * is ~1440 rows. The route handler downsamples on the way out, so the
 * client gets a compact payload regardless.
 */
export async function getDeviceObservations(
  deviceId: number,
  timeStartSec: number,
  timeEndSec: number,
): Promise<DeviceObsSample[]> {
  const path = `/observations/device/${deviceId}?time_start=${timeStartSec}&time_end=${timeEndSec}`;
  const raw = await tempestFetch(path, deviceObsResponse, 300);
  // R5: Tempest can return `obs: null` for empty windows; treat that
  // as "no samples" rather than letting it crash downstream.
  const rows = raw.obs ?? [];
  return rows.map((row) => ({
    ts: (row[ST_INDEX.ts] ?? 0) * 1000,
    windAvgMps: row[ST_INDEX.windAvgMps] ?? null,
    windGustMps: row[ST_INDEX.windGustMps] ?? null,
    windDirDeg: row[ST_INDEX.windDirDeg] ?? null,
    pressureMb: row[ST_INDEX.stationPressureMb] ?? null,
    tempC: row[ST_INDEX.tempC] ?? null,
    humidityPct: row[ST_INDEX.humidityPct] ?? null,
    uv: row[ST_INDEX.uv] ?? null,
    solarWm2: row[ST_INDEX.solarRadiationWm2] ?? null,
    rainMm: row[ST_INDEX.rainAccumulatedMm] ?? null,
    batteryV: row[ST_INDEX.batteryV] ?? null,
    lightningStrikeCount: row[ST_INDEX.lightningStrikeCount] ?? null,
  }));
}

// ─── obs_st_ext (daily aggregates for ranges > 180 days) ────────────────
//
// When `time_end - time_start` exceeds 180 days, Tempest returns a
// fundamentally different response: `type: "obs_st_ext"`,
// `bucket_step_minutes: 1440`, 34-column rows where col 0 is a
// "YYYY-MM-DD" station-local date string and cols 1-33 are pre-rolled
// daily aggregates. This means we don't have to compute aggregates
// ourselves — Tempest's stats_day pipeline does it for us.
//
// The format is documented at
// https://community.tempest.earth/t/what-format-is-tempests-historical-data-in-api/23078/2
// (community-sourced; cross-validated empirically against multi-year
// station data during initial development).
//
// Behavior verified:
//   - Transition from `obs_st` (≤180d) to `obs_st_ext` (≥181d) is
//     exact, not gradual
//   - Date strings are in station-local tz (response includes
//     `tz_name`); day boundaries are local-midnight to local-midnight
//   - "Today" is included as a partial row with sample_count equal to
//     minutes-since-station-local-midnight
//
// Caller must request a time window of at least 181 days to land in
// the obs_st_ext tier. Anything shorter falls through to the standard
// obs_st 22-column format.

// Positional column index for `obs_st_ext` rows — only the columns
// this dashboard actually surfaces. Tempest's full row has 34 columns
// (0..33); the omitted ones (illuminance min/avg/max, uv min, solar
// min, windSampleInterval, windLullMin, lightningStrikeAvgDistance,
// rainMinutesToday/Final, precipType, precipAnalysisType,
// rainAccumTodayMm) had no UI consumers and were dropped from the
// index, the typed result, and the decoder below to keep the
// boundary contract honest.
const EXT_INDEX = {
  date: 0, // YYYY-MM-DD station-local
  pressureAvgMb: 1,
  pressureMaxMb: 2,
  pressureMinMb: 3,
  tempAvgC: 4,
  tempMaxC: 5,
  tempMinC: 6,
  humidityAvgPct: 7,
  humidityMaxPct: 8,
  humidityMinPct: 9,
  uvAvg: 13,
  uvMax: 14,
  solarAvgWm2: 16,
  solarMaxWm2: 17,
  windAvgMps: 19,
  windGustMaxMps: 20,
  windLullMinMps: 21,
  windDirDeg: 22, // vector-averaged daily predominant direction
  lightningStrikeCount: 24,
  recordCountMinutes: 26, // 0..1440 — count of valid 1-min obs that day
  batteryV: 27,
  rainAccumFinalMm: 29, // post rain-check (USE THIS for trusted totals)
} as const;

const EXT_ROW_COLUMN_COUNT = 34;
const EXT_BUCKET_STEP_MINUTES = 1440;

const deviceDailyObsResponse = z.object({
  device_id: z.number(),
  type: z.string().optional(),
  bucket_step_minutes: z.number().nullable().optional(),
  tz_name: z.string().optional(),
  // Rows are mixed-type (date string at col 0, numbers elsewhere). Loose
  // schema at the boundary; stricter validation is done in the decoder.
  obs: z
    .array(z.array(z.union([z.string(), z.number(), z.null()])))
    .nullable(),
  status: z
    .object({
      status_code: z.number(),
      status_message: z.string().optional(),
    })
    .optional(),
});

export interface DeviceDailyAggregate {
  /** YYYY-MM-DD in the station's local tz. */
  date: string;
  pressureAvgMb: number | null;
  pressureMaxMb: number | null;
  pressureMinMb: number | null;
  tempAvgC: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  humidityAvgPct: number | null;
  humidityMaxPct: number | null;
  humidityMinPct: number | null;
  uvAvg: number | null;
  uvMax: number | null;
  solarAvgWm2: number | null;
  solarMaxWm2: number | null;
  windAvgMps: number | null;
  windGustMaxMps: number | null;
  windLullMinMps: number | null;
  windDirDeg: number | null;
  /** Daily total — direct from Tempest's stats pipeline. */
  lightningStrikeCount: number | null;
  /**
   * Minutes of valid obs that day, ~0..1440 typical.
   * - <1380: partial / outage day (or "today" still in progress)
   * - 1437-1438: typical complete day
   * - ~1380: spring-forward DST day on a DST-observing station (23 hours)
   * - ~1500: fall-back DST day on a DST-observing station (25 hours)
   * Don't hard-cap at 1440 — DST-observing stations exceed it twice a
   * year. Use this purely as a "data completeness" signal, not a
   * strict bound.
   */
  recordCountMinutes: number | null;
  batteryV: number | null;
  /**
   * VERIFIED daily rain accumulation in mm (Tempest's "rain check"
   * feature). Cross-references the haptic sensor against nearby
   * radar + network data to:
   *   - ADD rain the sensor missed (light precip below trigger threshold)
   *   - REMOVE false positives (debris hits, vibration artifacts)
   * This is the canonical value Tempest themselves display in their
   * official app + web dashboard. Use this for any user-facing total
   * unless you have a specific reason to want the raw sensor reading
   * (the unverified `rainAccumTodayMm` column was dropped from the
   * decoder once we confirmed no consumer wanted the raw value).
   */
  rainAccumFinalMm: number | null;
}

interface DailyAggregateGuardrailFailure {
  reason: string;
  payloadType?: string;
  payloadBucket?: number | null;
  rowSample?: unknown;
  rowIndex?: number;
}

class TempestSchemaError extends Error {
  constructor(public readonly detail: DailyAggregateGuardrailFailure) {
    super(`Tempest schema check failed: ${detail.reason}`);
    this.name = "TempestSchemaError";
  }
}

/**
 * Parse + decode an obs_st_ext row into a typed `DeviceDailyAggregate`.
 *
 * Applies strict guardrails:
 *   - Row length must equal 34
 *   - Column 0 must be a YYYY-MM-DD date string
 *   - Triplet sanity (max ≥ avg ≥ min) for pressure / temp / humidity
 *
 * Throws `TempestSchemaError` on guardrail failure so callers can
 * decide whether to fail closed or fall back to a different fetch
 * path. Per-row sanity failures are caught in the iterator and
 * logged (not thrown) — a single bad row shouldn't kill a 365-row
 * fetch.
 */
function decodeExtRow(
  row: (string | number | null)[],
  rowIndex: number,
): DeviceDailyAggregate {
  if (row.length !== EXT_ROW_COLUMN_COUNT) {
    throw new TempestSchemaError({
      reason: `Row ${rowIndex} has ${row.length} columns, expected ${EXT_ROW_COLUMN_COUNT}`,
      rowIndex,
      rowSample: row,
    });
  }
  const date = row[EXT_INDEX.date];
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TempestSchemaError({
      reason: `Row ${rowIndex} col 0 is not a YYYY-MM-DD date: ${JSON.stringify(date)}`,
      rowIndex,
      rowSample: row,
    });
  }
  const num = (i: number): number | null => {
    const v = row[i];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return {
    date,
    pressureAvgMb: num(EXT_INDEX.pressureAvgMb),
    pressureMaxMb: num(EXT_INDEX.pressureMaxMb),
    pressureMinMb: num(EXT_INDEX.pressureMinMb),
    tempAvgC: num(EXT_INDEX.tempAvgC),
    tempMaxC: num(EXT_INDEX.tempMaxC),
    tempMinC: num(EXT_INDEX.tempMinC),
    humidityAvgPct: num(EXT_INDEX.humidityAvgPct),
    humidityMaxPct: num(EXT_INDEX.humidityMaxPct),
    humidityMinPct: num(EXT_INDEX.humidityMinPct),
    uvAvg: num(EXT_INDEX.uvAvg),
    uvMax: num(EXT_INDEX.uvMax),
    solarAvgWm2: num(EXT_INDEX.solarAvgWm2),
    solarMaxWm2: num(EXT_INDEX.solarMaxWm2),
    windAvgMps: num(EXT_INDEX.windAvgMps),
    windGustMaxMps: num(EXT_INDEX.windGustMaxMps),
    windLullMinMps: num(EXT_INDEX.windLullMinMps),
    windDirDeg: num(EXT_INDEX.windDirDeg),
    lightningStrikeCount: num(EXT_INDEX.lightningStrikeCount),
    recordCountMinutes: num(EXT_INDEX.recordCountMinutes),
    batteryV: num(EXT_INDEX.batteryV),
    rainAccumFinalMm: num(EXT_INDEX.rainAccumFinalMm),
  };
}

/**
 * GET /observations/device/{id}?time_start=&time_end= where the window
 * is large enough (≥181 days) to trigger Tempest's obs_st_ext daily-
 * aggregate response format.
 *
 * Caller MUST pass `days >= 181`. Shorter windows fall back to the
 * standard obs_st format (22 cols, sub-daily cadence) and would fail
 * the schema guardrails below. The route handler enforces this.
 *
 * Cache: 6h. Daily aggregates only meaningfully change at station-
 * local midnight (when yesterday's row finalizes) and the partial
 * "today" row updates ~minutely; a 6h cache means at most 4 cache-
 * miss fetches per day for the same device, which is well within
 * Tempest's rate limits.
 */
export async function getDeviceDailyAggregates(
  deviceId: number,
  days: number,
): Promise<{ tz: string | null; aggregates: DeviceDailyAggregate[] }> {
  if (days < 181) {
    throw new TempestSchemaError({
      reason: `getDeviceDailyAggregates requires days >= 181 to trigger obs_st_ext format; got ${days}`,
    });
  }
  const now = Math.floor(Date.now() / 1000);
  const start = now - days * 86400;
  const path = `/observations/device/${deviceId}?time_start=${start}&time_end=${now}`;
  const raw = await tempestFetch(path, deviceDailyObsResponse, 21600);

  // Top-level guardrails: type + bucket_step must match what we expect
  // for an obs_st_ext response. If Tempest changes the format, fail
  // closed with a clear error rather than silently corrupting the data.
  if (raw.type !== "obs_st_ext") {
    throw new TempestSchemaError({
      reason: `Expected response type "obs_st_ext", got ${JSON.stringify(raw.type)}. Tempest format may have changed.`,
      payloadType: raw.type,
      payloadBucket: raw.bucket_step_minutes ?? null,
    });
  }
  if (raw.bucket_step_minutes !== EXT_BUCKET_STEP_MINUTES) {
    throw new TempestSchemaError({
      reason: `Expected bucket_step_minutes=${EXT_BUCKET_STEP_MINUTES} (daily), got ${raw.bucket_step_minutes}`,
      payloadType: raw.type,
      payloadBucket: raw.bucket_step_minutes ?? null,
    });
  }

  const rows = raw.obs ?? [];
  const aggregates: DeviceDailyAggregate[] = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      aggregates.push(decodeExtRow(rows[i], i));
    } catch (err) {
      // Per-row failures are logged + skipped, not fatal. A single
      // malformed row shouldn't kill a 365-row response.
      console.warn(
        `[tempest] Skipped malformed obs_st_ext row ${i}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { tz: raw.tz_name ?? null, aggregates };
}
