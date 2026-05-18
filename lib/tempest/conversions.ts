/**
 * Pure unit conversions between WeatherFlow's metric defaults and the
 * imperial values the dashboard renders by default. Every function is a
 * pure number → number transform; callers decide rounding and formatting.
 *
 * Keep this module dependency-free: it runs both server (Route Handlers,
 * tests) and client (TanStack hooks, components) without surprises.
 */

// One-way metric → imperial only. Reverse conversions
// (`fToC` / `mphToMps` / etc.) used to live here but had no consumers
// outside their own round-trip tests; reintroduce them if a feature
// ever needs to parse imperial-input back into the canonical metric.
export const cToF = (c: number): number => (c * 9) / 5 + 32;
export const mpsToMph = (mps: number): number => mps * 2.2369362921;
export const mmToIn = (mm: number): number => mm / 25.4;
export const mbToInHg = (mb: number): number => mb * 0.0295299830714;
export const kmToMi = (km: number): number => km * 0.6213711922;

/**
 * Magnus-formula dew point in °C from dry-bulb temperature (°C) and
 * relative humidity (0–100). The Magnus coefficients used here are the
 * commonly cited Alduchov–Eskridge values, accurate to ~0.4 °C across
 * the everyday meteorological range.
 */
export function dewPointC(tempC: number, humidityPct: number): number {
  const a = 17.625;
  const b = 243.04;
  const rh = Math.max(0.01, Math.min(100, humidityPct)) / 100;
  const gamma = Math.log(rh) + (a * tempC) / (b + tempC);
  return (b * gamma) / (a - gamma);
}

/** Dew point in °F — convenience wrapper around `dewPointC` for chart
 *  consumers that work in imperial. */
export const dewPointF = (tempC: number, humidityPct: number): number =>
  cToF(dewPointC(tempC, humidityPct));

/**
 * NOAA Rothfusz heat-index regression in °F. Only meaningful when
 * tempF ≥ 80°F and humidityPct ≥ 40% (the regression was fit in that
 * domain and degrades quickly outside it). Outside that band this
 * returns the dry-bulb temperature unchanged so the "feels-like"
 * caller can fall through to wind-chill or to bare temp.
 *
 * Source: https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml
 */
export function heatIndexF(tempF: number, humidityPct: number): number {
  if (tempF < 80 || humidityPct < 40) return tempF;
  const T = tempF;
  const RH = humidityPct;
  return (
    -42.379 +
    2.04901523 * T +
    10.14333127 * RH -
    0.22475541 * T * RH -
    6.83783e-3 * T * T -
    5.481717e-2 * RH * RH +
    1.22874e-3 * T * T * RH +
    8.5282e-4 * T * RH * RH -
    1.99e-6 * T * T * RH * RH
  );
}

/**
 * NWS wind-chill formula in °F. Only meaningful when tempF ≤ 50°F and
 * windMph > 3 (below that wind speed wind chill ≈ ambient temp, and
 * above that temp the formula's polynomial is undefined). Outside the
 * band this returns the dry-bulb temperature unchanged.
 *
 * Source: https://www.weather.gov/safety/cold-wind-chill-chart
 */
export function windChillF(tempF: number, windMph: number): number {
  if (tempF > 50 || windMph <= 3) return tempF;
  const T = tempF;
  const V = Math.pow(windMph, 0.16);
  return 35.74 + 0.6215 * T - 35.75 * V + 0.4275 * T * V;
}

/**
 * "Feels like" temperature in °F. Picks the appropriate adjustment
 * for the current conditions:
 *
 *   - tempF ≥ 80°F and humidityPct ≥ 40%  → heat index (NOAA)
 *   - tempF ≤ 50°F and windMph > 3        → wind chill (NWS)
 *   - otherwise                            → dry-bulb temp unchanged
 *
 * Matches the convention Tempest itself uses on its forecast feed
 * (`current_conditions.feels_like`) — we recompute locally for the
 * History tab's daily-aggregate path, which Tempest's `obs_st_ext`
 * response doesn't supply natively.
 */
export function feelsLikeF(
  tempF: number,
  humidityPct: number,
  windMph: number,
): number {
  if (tempF >= 80 && humidityPct >= 40) return heatIndexF(tempF, humidityPct);
  if (tempF <= 50 && windMph > 3) return windChillF(tempF, windMph);
  return tempF;
}

/**
 * Beaufort wind-force class (0–12) for a wind speed in mph. Returns
 * the integer scale level and a descriptive name suitable for chips.
 */
export function beaufort(windMph: number): { level: number; name: string } {
  if (windMph < 1) return { level: 0, name: "Calm" };
  if (windMph < 4) return { level: 1, name: "Light air" };
  if (windMph < 8) return { level: 2, name: "Light breeze" };
  if (windMph < 13) return { level: 3, name: "Gentle breeze" };
  if (windMph < 19) return { level: 4, name: "Moderate breeze" };
  if (windMph < 25) return { level: 5, name: "Fresh breeze" };
  if (windMph < 32) return { level: 6, name: "Strong breeze" };
  if (windMph < 39) return { level: 7, name: "High wind" };
  if (windMph < 47) return { level: 8, name: "Gale" };
  if (windMph < 55) return { level: 9, name: "Strong gale" };
  if (windMph < 64) return { level: 10, name: "Storm" };
  if (windMph < 73) return { level: 11, name: "Violent storm" };
  return { level: 12, name: "Hurricane" };
}

/**
 * Compass direction (N, NNE, NE, …) for a wind heading in degrees.
 * Heading is meteorological — 0° = wind from the north.
 */
export function cardinal(deg: number): string {
  const dirs = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 22.5) % 16;
  return dirs[idx];
}
