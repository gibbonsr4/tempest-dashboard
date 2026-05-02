/**
 * Single Zustand store. Holds the WebSocket connection state, the
 * rapid-wind ring buffer (last 60 samples ≈ 3 minutes), the recent
 * lightning-strike buffer, the persisted hourly AQI buffer, and a
 * couple of UI prefs.
 *
 * Server state lives in TanStack Query — this store is reserved for
 * realtime data the WS pushes and for cross-component UI prefs that
 * don't belong on a URL.
 */

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StrikeSample, WindSample, WsStatus } from "./tempest/types";

const WIND_RING = 60;
const STRIKE_RING = 12;
// 48 hourly samples = 2 days of AQI memory.
const AQI_RING = 48;

export interface AqiSample {
  ts: number; // epoch ms (top of the hour)
  aqi: number;
}

interface AppState {
  ws: { status: WsStatus; lastError?: string };
  setWsStatus: (status: WsStatus, lastError?: string) => void;

  rapidWind: WindSample[];
  pushRapidWind: (sample: WindSample) => void;

  recentStrikes: StrikeSample[];
  pushStrike: (sample: StrikeSample) => void;

  /**
   * Hourly AQI samples persisted across page reloads. AirNow's free
   * tier doesn't return historical data on the same endpoint, so we
   * accumulate one sample per hour from the live fetches and render
   * the sparkline from whatever we've collected to date.
   */
  aqiHistory: AqiSample[];
  pushAqi: (sample: AqiSample) => void;

  prefs: {
    adaptiveAccent: boolean;
  };
  setAdaptiveAccent: (b: boolean) => void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      ws: { status: "idle" },
      setWsStatus: (status, lastError) =>
        set((s) => ({ ws: { ...s.ws, status, lastError } })),

      rapidWind: [],
      pushRapidWind: (sample) =>
        set((s) => ({
          rapidWind: [...s.rapidWind.slice(-(WIND_RING - 1)), sample],
        })),

      recentStrikes: [],
      pushStrike: (sample) =>
        set((s) => ({
          recentStrikes: [...s.recentStrikes.slice(-(STRIKE_RING - 1)), sample],
        })),

      aqiHistory: [],
      pushAqi: (sample) =>
        set((s) => {
          // Bucket samples by hour; only keep the latest per hour so a
          // page refresh inside the same hour doesn't add duplicates.
          const hourMs = 60 * 60 * 1000;
          const bucket = Math.floor(sample.ts / hourMs);
          // Prune stale entries on every push. Persisted state can
          // accumulate samples older than the ring's nominal 48h
          // window (across a long absence from the page) because the
          // bucket-based "is this the same hour as last?" check only
          // inspects the latest entry. Walking the array to drop
          // anything beyond the time window keeps the ring honest.
          const cutoff = sample.ts - AQI_RING * hourMs;
          const fresh = s.aqiHistory.filter((entry) => entry.ts >= cutoff);
          const last = fresh[fresh.length - 1];
          if (last && Math.floor(last.ts / hourMs) === bucket) {
            // Replace the most recent sample so the latest reading wins.
            return {
              aqiHistory: [
                ...fresh.slice(0, -1),
                { ts: bucket * hourMs, aqi: sample.aqi },
              ],
            };
          }
          return {
            aqiHistory: [
              ...fresh.slice(-(AQI_RING - 1)),
              { ts: bucket * hourMs, aqi: sample.aqi },
            ],
          };
        }),

      prefs: {
        adaptiveAccent: false,
      },
      setAdaptiveAccent: (adaptiveAccent) =>
        set((s) => ({ prefs: { ...s.prefs, adaptiveAccent } })),
    }),
    {
      name: "tempest-prefs",
      partialize: (s) => ({ prefs: s.prefs, aqiHistory: s.aqiHistory }),
    },
  ),
);

/** Selector helper — keeps subscribing components stable. */
export const selectLatestWind = (s: AppState) =>
  s.rapidWind[s.rapidWind.length - 1] ?? null;
