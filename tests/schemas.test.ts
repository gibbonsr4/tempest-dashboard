import { describe, it, expect } from "vitest";
import {
  stationObservationsResponse,
  wsMessage,
  forecastResponse,
} from "@/lib/tempest/schemas";

// Synthetic placeholder — never matches a real Tempest account, makes
// the test fixtures grep-able. Schema tests don't care about the exact
// numeric value, only that the field accepts a number.
const TEST_STATION_ID = 99999;

describe("stationObservationsResponse", () => {
  it("parses a minimal valid payload", () => {
    const result = stationObservationsResponse.safeParse({
      station_id: TEST_STATION_ID,
      obs: [
        {
          timestamp: 1730000000,
          air_temperature: 25.5,
          feels_like: 26.0,
          relative_humidity: 22,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("tolerates null/missing optional fields", () => {
    const result = stationObservationsResponse.safeParse({
      station_id: TEST_STATION_ID,
      obs: [
        {
          timestamp: 1730000000,
          air_temperature: null,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty obs array", () => {
    const result = stationObservationsResponse.safeParse({
      station_id: TEST_STATION_ID,
      obs: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("wsMessage discriminator", () => {
  it("parses rapid_wind", () => {
    const result = wsMessage.safeParse({
      type: "rapid_wind",
      device_id: 1234,
      ob: [1730000000, 4.2, 215],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "rapid_wind") {
      expect(result.data.ob[0]).toBe(1730000000);
    }
  });

  it("parses evt_strike", () => {
    const result = wsMessage.safeParse({
      type: "evt_strike",
      device_id: 1234,
      evt: [1730000000, 8, 12345],
    });
    expect(result.success).toBe(true);
  });

  it("parses connection_opened", () => {
    expect(wsMessage.safeParse({ type: "connection_opened" }).success).toBe(true);
  });

  it("rejects unknown discriminator", () => {
    expect(wsMessage.safeParse({ type: "wat" }).success).toBe(false);
  });
});

describe("forecastResponse", () => {
  it("parses a minimal payload with forecast.daily and current_conditions", () => {
    const result = forecastResponse.safeParse({
      current_conditions: {
        time: 1730000000,
        air_temperature: 30,
        conditions: "Clear",
      },
      forecast: {
        daily: [
          {
            day_start_local: 1730000000,
            air_temp_high: 32,
            air_temp_low: 18,
            sunrise: 1730020000,
            sunset: 1730070000,
            icon: "clear-day",
          },
        ],
        hourly: [
          {
            time: 1730000000,
            air_temperature: 30,
            precip_probability: 0,
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});
