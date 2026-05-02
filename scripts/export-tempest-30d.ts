/**
 * One-off: export 30 days of hourly observations from the configured
 * Tempest station to data/tempest-30d-hourly.csv.
 *
 * Run with:  pnpm export:tempest
 *   (which expands to: node --env-file=.env.local scripts/export-tempest-30d.ts)
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = "https://swd.weatherflow.com/swd/rest";
const DAYS = 30;
const OUT_PATH = resolve(process.cwd(), "data/tempest-30d-hourly.csv");

const TOKEN = process.env.TEMPEST_TOKEN;
const STATION_ID = process.env.TEMPEST_STATION_ID;
if (!TOKEN) throw new Error("TEMPEST_TOKEN missing — check .env.local");
if (!STATION_ID) throw new Error("TEMPEST_STATION_ID missing — check .env.local");

// Positional indexes for a Tempest device observation row.
// https://weatherflow.github.io/Tempest/api/swagger/#!/observations/getObservationsByDeviceId
const I = {
  ts: 0,
  windAvgMs: 2,
  windGustMs: 3,
  windDirDeg: 4,
  pressureMb: 6,
  tempC: 7,
  humidityPct: 8,
  uv: 10,
  solarWm2: 11,
  precipMm: 12,
  lightningStrikeCount: 15,
} as const;

type ObsRow = (number | null)[];

async function tempest<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tempest ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function findTempestDeviceId(stationId: number): Promise<number> {
  type StationsResp = {
    stations: Array<{
      station_id: number;
      devices: Array<{ device_id: number; device_type: string }>;
    }>;
  };
  const data = await tempest<StationsResp>("/stations");
  const station = data.stations.find((s) => s.station_id === stationId);
  if (!station) throw new Error(`Station ${stationId} not found in /stations response`);
  // device_type "ST" = Tempest. "AR" = air, "SK" = sky, "HB" = hub.
  const tempest_dev = station.devices.find((d) => d.device_type === "ST");
  if (!tempest_dev) throw new Error(`No Tempest (ST) device on station ${stationId}`);
  return tempest_dev.device_id;
}

async function fetchDay(deviceId: number, dayOffset: number): Promise<ObsRow[]> {
  type ObsResp = { obs: ObsRow[] | null };
  const data = await tempest<ObsResp>(
    `/observations/device/${deviceId}?day_offset=${dayOffset}`,
  );
  return data.obs ?? [];
}

/** Pick the obs closest to each top-of-hour for the day. */
function selectHourly(rows: ObsRow[]): ObsRow[] {
  const byHour = new Map<number, { row: ObsRow; deltaSec: number }>();
  for (const row of rows) {
    const ts = row[I.ts];
    if (typeof ts !== "number") continue;
    const date = new Date(ts * 1000);
    // Bucket by UTC hour boundary
    const hourEpoch =
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
      ) / 1000;
    const delta = Math.abs(ts - hourEpoch);
    const existing = byHour.get(hourEpoch);
    if (!existing || delta < existing.deltaSec) {
      byHour.set(hourEpoch, { row, deltaSec: delta });
    }
  }
  return [...byHour.values()]
    .sort((a, b) => (a.row[I.ts] as number) - (b.row[I.ts] as number))
    .map((e) => e.row);
}

const cToF = (c: number | null) => (c == null ? null : (c * 9) / 5 + 32);
const msToMph = (ms: number | null) => (ms == null ? null : ms * 2.236936);
const mbToInHg = (mb: number | null) => (mb == null ? null : mb * 0.02953);
const mmToIn = (mm: number | null) => (mm == null ? null : mm * 0.03937);
const round = (n: number | null, places: number) =>
  n == null ? "" : Number(n.toFixed(places)).toString();

function rowToCsv(r: ObsRow): string {
  const ts = r[I.ts];
  const isoTs =
    typeof ts === "number" ? new Date(ts * 1000).toISOString() : "";
  return [
    isoTs,
    round(cToF(r[I.tempC] ?? null), 1),
    round(r[I.humidityPct] ?? null, 1),
    round(mbToInHg(r[I.pressureMb] ?? null), 2),
    round(msToMph(r[I.windAvgMs] ?? null), 1),
    round(msToMph(r[I.windGustMs] ?? null), 1),
    round(r[I.windDirDeg] ?? null, 0),
    round(mmToIn(r[I.precipMm] ?? null), 3),
    round(r[I.uv] ?? null, 1),
    round(r[I.solarWm2] ?? null, 0),
    round(r[I.lightningStrikeCount] ?? null, 0),
  ].join(",");
}

const HEADER = [
  "timestamp_iso",
  "temp_f",
  "humidity_pct",
  "pressure_inhg",
  "wind_avg_mph",
  "wind_gust_mph",
  "wind_dir_deg",
  "precip_in",
  "uv",
  "solar_w_m2",
  "lightning_strike_count",
].join(",");

async function main() {
  const stationIdNum = Number(STATION_ID);
  console.log(`Resolving device for station ${stationIdNum}…`);
  const deviceId = await findTempestDeviceId(stationIdNum);
  console.log(`  → device_id ${deviceId}`);

  const allHourly: ObsRow[] = [];
  // day_offset=0 is today (partial), so fetch 0..29 for ~30 days back.
  for (let d = 0; d < DAYS; d++) {
    const raw = await fetchDay(deviceId, d);
    const hourly = selectHourly(raw);
    allHourly.push(...hourly);
    console.log(
      `  day_offset=${String(d).padStart(2, " ")}  raw=${String(raw.length).padStart(4, " ")}  hourly=${hourly.length}`,
    );
  }

  // Combined sort + dedupe (top-of-hour buckets can overlap day boundaries
  // when local-vs-UTC wraps — keep the first occurrence of each hour).
  const seenHours = new Set<number>();
  const finalRows = allHourly
    .sort((a, b) => (a[I.ts] as number) - (b[I.ts] as number))
    .filter((r) => {
      const ts = r[I.ts] as number;
      const hourBucket = Math.floor(ts / 3600);
      if (seenHours.has(hourBucket)) return false;
      seenHours.add(hourBucket);
      return true;
    });

  const csv = [HEADER, ...finalRows.map(rowToCsv)].join("\n") + "\n";
  await writeFile(OUT_PATH, csv, "utf8");
  console.log(`\nWrote ${finalRows.length} rows to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
