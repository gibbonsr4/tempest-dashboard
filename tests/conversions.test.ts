import { describe, it, expect } from "vitest";
import {
  cToF,
  cardinal,
  kmToMi,
  mbToInHg,
  mmToIn,
  mpsToMph,
} from "@/lib/tempest/conversions";

describe("temperature conversions", () => {
  it("converts C → F", () => {
    expect(cToF(0)).toBe(32);
    expect(cToF(100)).toBe(212);
    expect(cToF(-40)).toBe(-40);
  });
});

describe("wind conversions", () => {
  it("converts m/s → mph", () => {
    expect(mpsToMph(10)).toBeCloseTo(22.3694, 4);
  });
});

describe("precip conversions", () => {
  it("converts mm → in", () => {
    expect(mmToIn(25.4)).toBeCloseTo(1, 4);
  });
});

describe("pressure conversions", () => {
  it("converts mb → inHg", () => {
    expect(mbToInHg(1013.25)).toBeCloseTo(29.92, 2);
  });
});

describe("distance conversions", () => {
  it("converts km → mi", () => {
    expect(kmToMi(1.609344)).toBeCloseTo(1, 4);
  });
});

describe("cardinal direction", () => {
  it("maps N/E/S/W cardinals", () => {
    expect(cardinal(0)).toBe("N");
    expect(cardinal(90)).toBe("E");
    expect(cardinal(180)).toBe("S");
    expect(cardinal(270)).toBe("W");
    expect(cardinal(360)).toBe("N");
  });

  it("maps intermediates", () => {
    expect(cardinal(22.5)).toBe("NNE");
    expect(cardinal(45)).toBe("NE");
    expect(cardinal(247.5)).toBe("WSW");
  });

  it("handles negative inputs by wrapping", () => {
    expect(cardinal(-90)).toBe("W");
  });
});
