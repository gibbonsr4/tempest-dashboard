/**
 * Zod schemas for the WeatherFlow Tempest REST + WebSocket API surfaces
 * the dashboard touches. Schemas validate at the fetch boundary; raw
 * responses never reach UI code.
 *
 * Tempest fields vary across firmware revisions and station configurations.
 * Most numeric fields are marked `.nullable().optional()` so a missing
 * sensor doesn't crash the parse — the UI components handle `null` /
 * `undefined` gracefully.
 *
 * Reference: https://weatherflow.github.io/Tempest/api/swagger/
 */

import { z } from "zod";

// ─── Common ──────────────────────────────────────────────────────────────

const numberOrNull = z.number().nullable();

const apiStatus = z.object({
  status_code: z.number(),
  status_message: z.string().optional(),
});

// ─── /stations ───────────────────────────────────────────────────────────

const device = z.object({
  device_id: z.number(),
  device_type: z.string(),
  serial_number: z.string().optional(),
  firmware_revision: z.union([z.string(), z.number()]).optional(),
  hardware_revision: z.union([z.string(), z.number()]).optional(),
});

export const station = z.object({
  station_id: z.number(),
  name: z.string(),
  public_name: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().optional(),
  station_meta: z
    .object({
      elevation: z.number().optional(),
    })
    .optional(),
  devices: z.array(device).optional(),
});

export const stationsResponse = z.object({
  stations: z.array(station),
  status: apiStatus.optional(),
});

export type Station = z.infer<typeof station>;
export type Device = z.infer<typeof device>;

// ─── /observations/station/{id} ──────────────────────────────────────────

// `wet_bulb_temperature`, `delta_t`, `air_density`, `brightness`, and
// `lightning_strike_count_last_3hr` are also returned by Tempest but
// no UI consumer reads them. Add them back here when a feature needs
// them — Zod will silently drop them from the parsed type until then.
export const stationObs = z.object({
  timestamp: z.number(), // epoch seconds
  air_temperature: numberOrNull.optional(),
  feels_like: numberOrNull.optional(),
  heat_index: numberOrNull.optional(),
  wind_chill: numberOrNull.optional(),
  dew_point: numberOrNull.optional(),
  relative_humidity: numberOrNull.optional(),
  station_pressure: numberOrNull.optional(),
  sea_level_pressure: numberOrNull.optional(),
  barometric_pressure: numberOrNull.optional(),
  pressure_trend: z.string().nullable().optional(),
  solar_radiation: numberOrNull.optional(),
  uv: numberOrNull.optional(),
  wind_avg: numberOrNull.optional(),
  wind_gust: numberOrNull.optional(),
  wind_lull: numberOrNull.optional(),
  wind_direction: numberOrNull.optional(),
  precip: numberOrNull.optional(),
  precip_accum_last_1hr: numberOrNull.optional(),
  precip_accum_local_day: numberOrNull.optional(),
  precip_accum_local_yesterday: numberOrNull.optional(),
  precip_minutes_local_day: numberOrNull.optional(),
  precip_minutes_local_yesterday: numberOrNull.optional(),
  lightning_strike_count: numberOrNull.optional(),
  lightning_strike_count_last_1hr: numberOrNull.optional(),
  lightning_strike_last_distance: numberOrNull.optional(),
  lightning_strike_last_epoch: numberOrNull.optional(),
});

export const stationObservationsResponse = z.object({
  station_id: z.number(),
  station_name: z.string().optional(),
  station_units: z.record(z.string(), z.string()).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  elevation: z.number().optional(),
  timezone: z.string().optional(),
  obs: z.array(stationObs).min(1),
  status: apiStatus.optional(),
});

export type StationObs = z.infer<typeof stationObs>;
export type StationObservationsResponse = z.infer<typeof stationObservationsResponse>;

// ─── /better_forecast ────────────────────────────────────────────────────

export const forecastDaily = z.object({
  day_start_local: z.number(),
  month_num: z.number().optional(),
  day_num: z.number().optional(),
  day_of_week: z.string().optional(),
  air_temp_high: numberOrNull.optional(),
  air_temp_low: numberOrNull.optional(),
  conditions: z.string().optional(),
  icon: z.string().optional(),
  sunrise: z.number().optional(),
  sunset: z.number().optional(),
  precip_probability: numberOrNull.optional(),
  precip_icon: z.string().optional(),
  precip_type: z.string().optional(),
});

export const forecastHourly = z.object({
  time: z.number(),
  conditions: z.string().optional(),
  icon: z.string().optional(),
  air_temperature: numberOrNull.optional(),
  feels_like: numberOrNull.optional(),
  precip: numberOrNull.optional(),
  precip_probability: numberOrNull.optional(),
  precip_icon: z.string().optional(),
  precip_type: z.string().optional(),
  wind_avg: numberOrNull.optional(),
  wind_direction: numberOrNull.optional(),
  wind_direction_cardinal: z.string().optional(),
  wind_gust: numberOrNull.optional(),
  sea_level_pressure: numberOrNull.optional(),
  relative_humidity: numberOrNull.optional(),
  uv: numberOrNull.optional(),
  local_hour: z.number().optional(),
  local_day: z.number().optional(),
});

export const forecastCurrent = z.object({
  time: z.number(),
  conditions: z.string().optional(),
  icon: z.string().optional(),
  air_temperature: numberOrNull.optional(),
  sea_level_pressure: numberOrNull.optional(),
  station_pressure: numberOrNull.optional(),
  pressure_trend: z.string().optional(),
  relative_humidity: numberOrNull.optional(),
  wind_avg: numberOrNull.optional(),
  wind_direction: numberOrNull.optional(),
  wind_direction_cardinal: z.string().optional(),
  wind_gust: numberOrNull.optional(),
  solar_radiation: numberOrNull.optional(),
  uv: numberOrNull.optional(),
  feels_like: numberOrNull.optional(),
  dew_point: numberOrNull.optional(),
  precip_accum_local_day: numberOrNull.optional(),
  precip_accum_local_yesterday: numberOrNull.optional(),
  precip_minutes_local_day: numberOrNull.optional(),
  precip_minutes_local_yesterday: numberOrNull.optional(),
  is_precip_local_day_rain_check: z.boolean().optional(),
  is_precip_local_yesterday_rain_check: z.boolean().optional(),
  lightning_strike_count_last_1hr: numberOrNull.optional(),
  lightning_strike_last_distance: numberOrNull.optional(),
  lightning_strike_last_distance_msg: z.string().optional(),
  lightning_strike_last_epoch: numberOrNull.optional(),
});

export const forecastResponse = z.object({
  current_conditions: forecastCurrent.optional(),
  forecast: z
    .object({
      daily: z.array(forecastDaily).optional(),
      hourly: z.array(forecastHourly).optional(),
    })
    .optional(),
  units: z.record(z.string(), z.string()).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  timezone: z.string().optional(),
  timezone_offset_minutes: z.number().optional(),
  status: apiStatus.optional(),
});

export type ForecastDaily = z.infer<typeof forecastDaily>;
export type ForecastHourly = z.infer<typeof forecastHourly>;
export type ForecastCurrent = z.infer<typeof forecastCurrent>;
export type ForecastResponse = z.infer<typeof forecastResponse>;

// ─── WebSocket messages ──────────────────────────────────────────────────

const wsConnectionOpened = z.object({
  type: z.literal("connection_opened"),
});
const wsAck = z.object({
  type: z.literal("ack"),
  id: z.string().optional(),
});
const wsRapidWind = z.object({
  type: z.literal("rapid_wind"),
  serial_number: z.string().optional(),
  hub_sn: z.string().optional(),
  device_id: z.number(),
  ob: z.tuple([z.number(), z.number(), z.number()]), // [epoch_s, mps, dir_deg]
});

/**
 * obs_st payload — per the device-observation contract, `obs` is an
 * array of arrays of fixed-position numerics. We only consume a handful
 * of indices, so we accept any-length tuples and decode positionally.
 */
const wsObsSt = z.object({
  type: z.literal("obs_st"),
  serial_number: z.string().optional(),
  hub_sn: z.string().optional(),
  device_id: z.number(),
  obs: z.array(z.array(z.number().nullable())),
});

const wsEvtPrecip = z.object({
  type: z.literal("evt_precip"),
  device_id: z.number(),
  evt: z.tuple([z.number()]), // [epoch_s]
});
const wsEvtStrike = z.object({
  type: z.literal("evt_strike"),
  device_id: z.number(),
  evt: z.tuple([z.number(), z.number(), z.number()]), // [epoch_s, distance_km, energy]
});

export const wsMessage = z.discriminatedUnion("type", [
  wsConnectionOpened,
  wsAck,
  wsRapidWind,
  wsObsSt,
  wsEvtPrecip,
  wsEvtStrike,
]);

export type WsMessage = z.infer<typeof wsMessage>;
export type WsRapidWind = z.infer<typeof wsRapidWind>;
export type WsEvtStrike = z.infer<typeof wsEvtStrike>;
export type WsEvtPrecip = z.infer<typeof wsEvtPrecip>;
