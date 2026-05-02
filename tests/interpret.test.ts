import { describe, it, expect } from "vitest";
import {
  aqiBand,
  conditionsPhrase,
  interpretPressure,
  pressureRateMbPerHr,
  shouldExpandRain,
  shouldPromoteLightning,
  uvBand,
} from "@/lib/tempest/interpret";

describe("interpretPressure", () => {
  it("classifies rapid rises", () => {
    expect(interpretPressure(2)).toMatchObject({ arrow: "▲" });
  });
  it("classifies slow rises", () => {
    expect(interpretPressure(0.5)).toMatchObject({ arrow: "▴" });
  });
  it("classifies steady", () => {
    expect(interpretPressure(0)).toMatchObject({ arrow: "", phrase: "steady" });
  });
  it("classifies slow falls", () => {
    expect(interpretPressure(-0.5)).toMatchObject({ arrow: "▾" });
  });
  it("classifies rapid falls", () => {
    expect(interpretPressure(-2)).toMatchObject({ arrow: "▼" });
  });
});

describe("uvBand", () => {
  it("buckets correctly", () => {
    expect(uvBand(0).label).toBe("Low");
    expect(uvBand(2).label).toBe("Low");
    expect(uvBand(3).label).toBe("Moderate");
    expect(uvBand(6).label).toBe("High");
    expect(uvBand(8).label).toBe("Very High");
    expect(uvBand(11).label).toBe("Extreme");
  });
});

describe("aqiBand", () => {
  it("buckets the EPA scale", () => {
    expect(aqiBand(20).label).toBe("Good");
    expect(aqiBand(75).label).toBe("Moderate");
    expect(aqiBand(125).label).toBe("Unhealthy for Sensitive Groups");
    expect(aqiBand(175).label).toBe("Unhealthy");
    expect(aqiBand(250).label).toBe("Very Unhealthy");
    expect(aqiBand(350).label).toBe("Hazardous");
  });
});

describe("conditionsPhrase", () => {
  it("flags dangerous heat", () => {
    expect(conditionsPhrase({ tempF: 110, feelsLikeF: 115 })).toBe(
      "Dangerous heat",
    );
  });
  it("describes hot dry conditions", () => {
    expect(
      conditionsPhrase({ tempF: 96, feelsLikeF: 96, humidity: 12, uv: 9 }),
    ).toBe("Hot, very dry, intense UV");
  });
  it("describes a mild dry afternoon", () => {
    expect(
      conditionsPhrase({ tempF: 78, feelsLikeF: 78, humidity: 25, uv: 4, windMph: 6 }),
    ).toBe("Mild, dry");
  });
  it("flags a breezy cool day", () => {
    expect(
      conditionsPhrase({ tempF: 60, feelsLikeF: 58, humidity: 50, windMph: 22 }),
    ).toBe("Cool, breezy");
  });
  it("calls 77% RH 'very humid' to match the metric tile band", () => {
    // Regression: previously the threshold was 80, so 75-79% RH read
    // as just "humid" in the phrase while the humidity tile chip said
    // "Very humid" — visible contradiction.
    expect(
      conditionsPhrase({ tempF: 85, feelsLikeF: 88, humidity: 77 }),
    ).toBe("Warm, very humid");
  });
});

describe("shouldPromoteLightning", () => {
  it("promotes when close + recent", () => {
    expect(
      shouldPromoteLightning({
        lastStrikeEpochMs: Date.now() - 5 * 60_000,
        lastStrikeMi: 5,
      }),
    ).toBe(true);
  });
  it("does not promote when far away", () => {
    expect(
      shouldPromoteLightning({
        lastStrikeEpochMs: Date.now() - 5 * 60_000,
        lastStrikeMi: 25,
      }),
    ).toBe(false);
  });
  it("does not promote when stale", () => {
    expect(
      shouldPromoteLightning({
        lastStrikeEpochMs: Date.now() - 90 * 60_000,
        lastStrikeMi: 3,
      }),
    ).toBe(false);
  });
});

describe("pressureRateMbPerHr", () => {
  const NOW = 1_700_000_000_000;
  const HOUR = 3_600_000;
  const sample = (offsetHrs: number, mb: number | null) => ({
    ts: NOW - offsetHrs * HOUR,
    pressureMb: mb,
  });

  it("returns 0 when current pressure is unknown", () => {
    expect(pressureRateMbPerHr([sample(3, 1010)], null, NOW)).toBe(0);
  });

  it("returns 0 with no historical samples", () => {
    expect(pressureRateMbPerHr([], 1015, NOW)).toBe(0);
  });

  it("computes a positive rate when pressure is rising", () => {
    // 3 hours ago: 1010 mb, now: 1013 mb → +1 mb/hr
    const samples = [sample(3, 1010)];
    expect(pressureRateMbPerHr(samples, 1013, NOW)).toBeCloseTo(1, 4);
  });

  it("computes a negative rate when pressure is falling", () => {
    // 3 hours ago: 1015 mb, now: 1009 mb → −2 mb/hr (storm-approach territory)
    const samples = [sample(3, 1015)];
    expect(pressureRateMbPerHr(samples, 1009, NOW)).toBeCloseTo(-2, 4);
  });

  it("picks the historical sample closest to 3h ago", () => {
    // Two candidates: one at 2h, one at 3h. Should pick the 3h one.
    const samples = [sample(2, 1011), sample(3, 1010)];
    expect(pressureRateMbPerHr(samples, 1014, NOW)).toBeCloseTo(
      (1014 - 1010) / 3,
      4,
    );
  });

  it("ignores future-dated samples (clock skew defense)", () => {
    const samples = [
      { ts: NOW + HOUR, pressureMb: 1020 }, // future, should be ignored
      sample(3, 1010),
    ];
    expect(pressureRateMbPerHr(samples, 1014, NOW)).toBeCloseTo(
      (1014 - 1010) / 3,
      4,
    );
  });

  it("returns 0 when the closest candidate is too recent (< 1.5h)", () => {
    // Buffer only has a sample from 10 min ago — too short a window
    // to derive a meaningful rate.
    const samples = [sample(10 / 60, 1013)];
    expect(pressureRateMbPerHr(samples, 1014, NOW)).toBe(0);
  });

  it("returns 0 when the closest candidate is too old (> 4.5h)", () => {
    // After an outage / sparse window, the closest sample to "3h ago"
    // could be ancient. Surface no trend rather than projecting a stale
    // delta onto "now."
    const samples = [sample(8, 1010)];
    expect(pressureRateMbPerHr(samples, 1014, NOW)).toBe(0);
  });

  it("accepts candidates inside the trust window [1.5h, 4.5h]", () => {
    expect(pressureRateMbPerHr([sample(2, 1010)], 1012, NOW)).toBeCloseTo(1, 4);
    expect(pressureRateMbPerHr([sample(4, 1010)], 1014, NOW)).toBeCloseTo(1, 4);
  });

  it("ignores samples with null/non-finite pressure", () => {
    const samples = [
      sample(3, null),
      { ts: NOW - 3 * HOUR + 60_000, pressureMb: NaN },
      sample(2.5, 1010),
    ];
    // Only the 2.5h-ago sample with finite 1010 contributes.
    expect(pressureRateMbPerHr(samples, 1015, NOW)).toBeCloseTo(
      (1015 - 1010) / 2.5,
      4,
    );
  });
});

describe("shouldExpandRain", () => {
  it("expands when actively raining", () => {
    expect(shouldExpandRain({ lastHourPrecip: 0, dayTotal: 0, rateNow: 0.1 }))
      .toBe(true);
  });
  it("expands when day total is non-zero", () => {
    expect(shouldExpandRain({ lastHourPrecip: 0, dayTotal: 1.5, rateNow: 0 }))
      .toBe(true);
  });
  it("collapses when fully dry", () => {
    expect(shouldExpandRain({ lastHourPrecip: 0, dayTotal: 0, rateNow: 0 }))
      .toBe(false);
  });
});
