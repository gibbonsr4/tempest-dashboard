import { describe, it, expect } from "vitest";
import { sortAlertsBySeverity } from "@/lib/nws/sort";
import type { Alert } from "@/lib/nws/schemas";

const mk = (
  event: string,
  severity?: string,
  urgency?: string,
  expires?: string,
): Alert => ({
  id: event,
  type: "Feature",
  geometry: null,
  properties: {
    event,
    severity,
    urgency,
    expires,
  },
});

describe("sortAlertsBySeverity", () => {
  it("returns [] for an empty input", () => {
    expect(sortAlertsBySeverity([])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [mk("A", "Minor"), mk("B", "Severe")];
    const snapshot = [...input];
    sortAlertsBySeverity(input);
    expect(input).toEqual(snapshot);
  });

  it("ranks Extreme above Severe above Moderate above Minor", () => {
    const out = sortAlertsBySeverity([
      mk("Minor advisory", "Minor"),
      mk("Severe warning", "Severe"),
      mk("Moderate watch", "Moderate"),
      mk("Extreme warning", "Extreme"),
    ]);
    expect(out.map((a) => a.properties.event)).toEqual([
      "Extreme warning",
      "Severe warning",
      "Moderate watch",
      "Minor advisory",
    ]);
  });

  it("breaks severity ties by urgency (Immediate > Expected > Future > Past)", () => {
    const out = sortAlertsBySeverity([
      mk("Severe past", "Severe", "Past"),
      mk("Severe immediate", "Severe", "Immediate"),
      mk("Severe expected", "Severe", "Expected"),
      mk("Severe future", "Severe", "Future"),
    ]);
    expect(out.map((a) => a.properties.event)).toEqual([
      "Severe immediate",
      "Severe expected",
      "Severe future",
      "Severe past",
    ]);
  });

  it("breaks ties by sooner expiration", () => {
    const out = sortAlertsBySeverity([
      mk("Late", "Severe", "Expected", "2030-01-01T00:00:00Z"),
      mk("Soon", "Severe", "Expected", "2024-01-01T00:00:00Z"),
      mk("Mid", "Severe", "Expected", "2027-01-01T00:00:00Z"),
    ]);
    expect(out.map((a) => a.properties.event)).toEqual([
      "Soon",
      "Mid",
      "Late",
    ]);
  });

  it("treats unknown / missing severity as below Minor", () => {
    const out = sortAlertsBySeverity([
      mk("Mystery"),
      mk("Minor advisory", "Minor"),
    ]);
    expect(out[0].properties.event).toBe("Minor advisory");
  });

  it("promotes the Severe warning even when Minor was first in the input (the regression)", () => {
    const out = sortAlertsBySeverity([
      mk("Coastal flood advisory", "Minor"),
      mk("Tornado warning", "Severe", "Immediate"),
    ]);
    expect(out[0].properties.event).toBe("Tornado warning");
  });
});
