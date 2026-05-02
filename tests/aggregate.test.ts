import { describe, it, expect } from "vitest";
import { aggregateByDay } from "@/components/history/aggregate";
import type { HistorySample } from "@/lib/hooks/useRecentHistory";

const TZ = "Pacific/Honolulu";

const baseSample = (overrides: Partial<HistorySample> = {}): HistorySample => ({
  ts: 0,
  windAvgMps: null,
  windGustMps: null,
  windDirDeg: null,
  pressureMb: null,
  tempC: null,
  humidityPct: null,
  uv: null,
  solarWm2: null,
  rainMm: null,
  batteryV: null,
  lightningStrikeCount: null,
  ...overrides,
});

const day = (ymd: string, h = 12) =>
  // The fixture tz (`Pacific/Honolulu`, UTC-10) is intentionally a
  // non-DST zone so the math is reproducible across CI environments.
  // Any non-DST timezone would work; matching the offset to TZ above
  // keeps the constructed Dates aligned with how the helper interprets
  // them.
  new Date(`${ymd}T${String(h).padStart(2, "0")}:00:00-10:00`).getTime();

describe("aggregateByDay", () => {
  it("returns [] for empty input", () => {
    expect(aggregateByDay([], (s) => s.tempC, TZ)).toEqual([]);
  });

  it("groups samples on the same station-local day", () => {
    const samples = [
      baseSample({ ts: day("2024-04-15", 8), tempC: 20 }),
      baseSample({ ts: day("2024-04-15", 14), tempC: 30 }),
    ];
    const out = aggregateByDay(samples, (s) => s.tempC, TZ);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
    expect(out[0].min).toBe(20);
    expect(out[0].max).toBe(30);
    expect(out[0].mean).toBe(25);
    expect(out[0].sum).toBe(50);
  });

  it("materializes empty days between populated days (R6)", () => {
    const samples = [
      baseSample({ ts: day("2024-04-15"), tempC: 20 }),
      // No samples on 2024-04-16 or 2024-04-17 → outage gap.
      baseSample({ ts: day("2024-04-18"), tempC: 25 }),
    ];
    const out = aggregateByDay(samples, (s) => s.tempC, TZ);
    expect(out).toHaveLength(4);
    expect(out[0].count).toBe(1);
    expect(out[1].count).toBe(0);
    expect(out[1].min).toBeNull();
    expect(out[1].max).toBeNull();
    expect(out[1].mean).toBeNull();
    expect(out[1].sum).toBeNull();
    expect(out[2].count).toBe(0);
    expect(out[3].count).toBe(1);
  });

  it("yields strictly ascending timestamps", () => {
    const samples = [
      baseSample({ ts: day("2024-04-15"), tempC: 20 }),
      baseSample({ ts: day("2024-04-19"), tempC: 25 }),
    ];
    const out = aggregateByDay(samples, (s) => s.tempC, TZ);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].ts).toBeGreaterThan(out[i - 1].ts);
    }
  });

  it("uses sum (not average) for additive metrics like rain", () => {
    const samples = [
      baseSample({ ts: day("2024-04-15", 8), rainMm: 1.0 }),
      baseSample({ ts: day("2024-04-15", 14), rainMm: 2.5 }),
    ];
    const out = aggregateByDay(samples, (s) => s.rainMm, TZ);
    expect(out[0].sum).toBeCloseTo(3.5, 6);
  });

  it("skips a day's projector value when null but still creates the bucket", () => {
    const samples = [
      baseSample({ ts: day("2024-04-15"), tempC: null, humidityPct: 40 }),
      baseSample({ ts: day("2024-04-15"), tempC: 22, humidityPct: 50 }),
    ];
    const out = aggregateByDay(samples, (s) => s.tempC, TZ);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(1); // only the non-null tempC contributes
    expect(out[0].mean).toBe(22);
  });

  it("returns rows in chronological order even when input is shuffled", () => {
    const samples = [
      baseSample({ ts: day("2024-04-18"), tempC: 25 }),
      baseSample({ ts: day("2024-04-15"), tempC: 20 }),
      baseSample({ ts: day("2024-04-16"), tempC: 22 }),
    ];
    const out = aggregateByDay(samples, (s) => s.tempC, TZ);
    expect(out).toHaveLength(4);
    expect(out.map((r) => r.count)).toEqual([1, 1, 0, 1]);
  });
});
