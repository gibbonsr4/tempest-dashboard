"use client";

import * as React from "react";
import { useAqi } from "@/lib/hooks/useAqi";
import { useApp } from "@/lib/store";
import { aqiBand } from "@/lib/tempest/interpret";
import { MetricTile } from "./MetricTile";

/**
 * AirNow AQI tile. Uses the unified MetricTile shell so it visually
 * matches the rest of the metric row.
 *
 * AirNow's free `currentObservation` endpoint doesn't expose history,
 * so we accumulate one sample per hour into a persisted Zustand
 * buffer (`aqiHistory`). The sparkline reads from that buffer — at
 * one sample per hour the trend strip fills in slowly across a
 * session, but a returning user (the buffer persists across reloads)
 * sees days of recent AQI history rendered immediately.
 */
export function AirQualityCard() {
  const { data, isLoading, error } = useAqi();
  const pushAqi = useApp((s) => s.pushAqi);
  const aqiHistory = useApp((s) => s.aqiHistory);
  const aqiSpark = React.useMemo(
    () => aqiHistory.map((s) => s.aqi),
    [aqiHistory],
  );

  // Push at most once per AQI VALUE change. Comparing `data` refs
  // (the previous approach) silently re-pushed on every TanStack
  // refetch since `data` is a fresh object each time even when the
  // underlying AQI is unchanged. The store's same-hour bucket logic
  // was masking the duplicates but they were still arriving. Tracking
  // the last-pushed AQI integer keeps the effect honest about what
  // it considers "new data".
  const lastPushedAqiRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!data || data.noMonitor || data.aqi == null) return;
    if (lastPushedAqiRef.current === data.aqi) return;
    lastPushedAqiRef.current = data.aqi;
    pushAqi({ ts: Date.now(), aqi: data.aqi });
  }, [data, pushAqi]);

  if (isLoading || (!data && !error)) {
    return (
      <MetricTile label="Air quality" value="—" detail="Loading…" />
    );
  }
  if (error) {
    return (
      <MetricTile label="Air quality" value="—" detail="AirNow unavailable" />
    );
  }
  if (data?.noMonitor) {
    return (
      <MetricTile
        label="Air quality"
        value="—"
        detail="No nearby AQI monitor"
      />
    );
  }
  if (!data || data.aqi == null) {
    return <MetricTile label="Air quality" value="—" />;
  }

  const status = aqiBand(data.aqi);
  // Prefer AirNow's category label (e.g. "Good") when available, else
  // fall back to our locally-bucketed label.
  const display = data.category
    ? { label: data.category, color: status.color }
    : status;

  return (
    <MetricTile
      label="Air quality"
      value={`AQI ${data.aqi}`}
      status={display}
      detail={data.pollutant ? humanPollutant(data.pollutant) : undefined}
      spark={aqiSpark}
    />
  );
}

/**
 * Map AirNow's compact pollutant codes to plain-English names. The
 * dominant pollutant for the headline AQI varies by location and
 * season — typically O3 (ozone) in warm-weather urban areas, PM2.5
 * during wildfire smoke events, PM10 during dust events, and
 * NO2/SO2 near major industrial or traffic sources.
 */
function humanPollutant(code: string): string {
  switch (code.toUpperCase()) {
    case "O3":
    case "OZONE":
      return "Ozone";
    case "PM2.5":
    case "PM25":
      return "Fine particulate (PM2.5)";
    case "PM10":
      return "Coarse particulate (PM10)";
    case "NO2":
      return "Nitrogen dioxide";
    case "SO2":
      return "Sulfur dioxide";
    case "CO":
      return "Carbon monoxide";
    default:
      return code;
  }
}
