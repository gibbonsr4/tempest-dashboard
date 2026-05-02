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
