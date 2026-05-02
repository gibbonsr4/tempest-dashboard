/**
 * Re-exports of the Zod-inferred types and a few convenience aliases used
 * across hooks/components. This keeps consumer files free of direct
 * `schemas` imports when they only need types.
 */

export type {
  ForecastDaily,
  ForecastHourly,
  ForecastCurrent,
  ForecastResponse,
  Station,
  Device,
  StationObs,
  StationObservationsResponse,
  WsMessage,
  WsRapidWind,
  WsEvtStrike,
  WsEvtPrecip,
} from "./schemas";

export type WsStatus = "idle" | "connecting" | "open" | "closed";

/** A single rapid-wind sample held in the in-memory ring buffer. */
export interface WindSample {
  /** epoch ms */
  ts: number;
  /** wind speed in meters per second (raw API units) */
  mps: number;
  /** wind direction in degrees, 0° = from north */
  dirDeg: number;
}

/** A single 3-second sky-event from the WS lightning event stream. */
export interface StrikeSample {
  /** epoch ms */
  ts: number;
  /** distance in km (raw API units) */
  distanceKm: number;
  /** strike energy (uncalibrated, relative) */
  energy: number;
}

/** Generic UI hint about pressure trend. Steady carries an empty
 *  arrow ("") because the status chip + detail line already convey
 *  "no change"; an inline glyph there reads as visual noise. */
export interface PressureTrend {
  arrow: "▲" | "▴" | "" | "▾" | "▼";
  phrase: string;
}
