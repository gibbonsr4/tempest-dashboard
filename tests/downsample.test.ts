import { describe, it, expect } from "vitest";
import { downsample, vectorMeanDeg } from "@/lib/tempest/downsample";
import type { DeviceObsSample } from "@/lib/tempest/server-client";

const baseSample = (overrides: Partial<DeviceObsSample> = {}): DeviceObsSample => ({
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

describe("vectorMeanDeg", () => {
  it("returns null for an empty bucket", () => {
    expect(vectorMeanDeg(0, 0, 0)).toBeNull();
  });

  it("recovers the input direction when all samples agree", () => {
    // All north: each contributes (sin 0, cos 0) = (0, 1)
    expect(vectorMeanDeg(0, 5, 5)).toBeCloseTo(0, 4);
    // All east: each contributes (sin 90°, cos 90°) = (1, 0)
    expect(vectorMeanDeg(5, 0, 5)).toBeCloseTo(90, 4);
  });

  it("averages 350° and 10° to 0° (north), not 180° (south)", () => {
    // This is the regression: arithmetic mean would give 180.
    const θ1 = (350 * Math.PI) / 180;
    const θ2 = (10 * Math.PI) / 180;
    const sinSum = Math.sin(θ1) + Math.sin(θ2);
    const cosSum = Math.cos(θ1) + Math.cos(θ2);
    const result = vectorMeanDeg(sinSum, cosSum, 2);
    expect(result).not.toBeNull();
    expect(result! % 360).toBeCloseTo(0, 4);
  });

  it("returns a value in [0, 360)", () => {
    // West (270°): contributes (sin 270°, cos 270°) = (-1, 0)
    expect(vectorMeanDeg(-1, 0, 1)).toBeCloseTo(270, 4);
  });

  it("returns null when winds perfectly cancel", () => {
    // North + south: (sin 0 + sin 180, cos 0 + cos 180) = (0, 0)
    const θ1 = 0;
    const θ2 = Math.PI;
    const sinSum = Math.sin(θ1) + Math.sin(θ2);
    const cosSum = Math.cos(θ1) + Math.cos(θ2);
    expect(vectorMeanDeg(sinSum, cosSum, 2)).toBeNull();
  });
});

describe("downsample", () => {
  it("returns [] for an empty input", () => {
    expect(downsample([], 10)).toEqual([]);
  });

  it("uses circular mean for wind direction (350°/10° → ~0°)", () => {
    const samples = [
      baseSample({ ts: 0, windDirDeg: 350 }),
      baseSample({ ts: 1000, windDirDeg: 10 }),
    ];
    const out = downsample(samples, 1);
    expect(out).toHaveLength(1);
    const dir = out[0].windDirDeg;
    expect(dir).not.toBeNull();
    // Allow a small numerical wiggle around 0/360.
    const normalized = dir! < 180 ? dir! : dir! - 360;
    expect(Math.abs(normalized)).toBeLessThan(0.001);
  });

  it("sums rainMm per bucket (does not average)", () => {
    const samples = [
      baseSample({ ts: 0, rainMm: 0.1 }),
      baseSample({ ts: 1000, rainMm: 0.2 }),
      baseSample({ ts: 2000, rainMm: 0.3 }),
    ];
    const out = downsample(samples, 1);
    expect(out).toHaveLength(1);
    expect(out[0].rainMm).toBeCloseTo(0.6, 6);
  });

  it("arithmetically averages temperature and other scalar fields", () => {
    const samples = [
      baseSample({ ts: 0, tempC: 20, humidityPct: 50 }),
      baseSample({ ts: 1000, tempC: 30, humidityPct: 40 }),
    ];
    const out = downsample(samples, 1);
    expect(out[0].tempC).toBeCloseTo(25, 6);
    expect(out[0].humidityPct).toBeCloseTo(45, 6);
  });

  it("emits null for fields with no contributing samples", () => {
    const samples = [baseSample({ ts: 0, tempC: 20 })];
    const out = downsample(samples, 1);
    expect(out[0].tempC).toBe(20);
    expect(out[0].humidityPct).toBeNull();
    expect(out[0].rainMm).toBeNull();
    expect(out[0].windDirDeg).toBeNull();
  });

  it("skips empty buckets, keeping output compact", () => {
    const samples = [
      baseSample({ ts: 0, tempC: 10 }),
      baseSample({ ts: 10_000, tempC: 20 }),
    ];
    const out = downsample(samples, 5);
    // 5 buckets across [0, 10_000]; only the first and last contain data.
    expect(out.length).toBeLessThanOrEqual(2);
  });
});
