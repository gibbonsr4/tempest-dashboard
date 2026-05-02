"use client";

import * as React from "react";
import { useStationMeta } from "@/lib/hooks/useStationMeta";
import { useStationObs } from "@/lib/hooks/useStationObs";
import { useForecast } from "@/lib/hooks/useForecast";
import { useAlerts } from "@/lib/hooks/useAlerts";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useRecentHistory } from "@/lib/hooks/useRecentHistory";
import { TempestWs } from "@/lib/tempest/ws-client";
import { ConfigError } from "@/components/shared/ConfigError";
import { Skeleton } from "@/components/ui/skeleton";
import { AdaptiveLightningCard } from "./AdaptiveLightningCard";
import { AdaptiveRainCard } from "./AdaptiveRainCard";
import { AlertsBanner } from "./AlertsBanner";
import { MetricRow } from "./MetricRow";
import { ForecastFiveDay } from "./ForecastFiveDay";
import { ForecastHourly } from "./ForecastHourly";
import { HeroBlock } from "./HeroBlock";
import { HorizonBand } from "./HorizonBand";
import { LiveWindCard } from "./LiveWindCard";
import { StationHealth } from "./StationHealth";
import { shouldExpandRain, shouldPromoteLightning } from "@/lib/tempest/interpret";
import { kmToMi } from "@/lib/tempest/conversions";

/**
 * Owns the Now tab's data fetching, WebSocket lifecycle, and bento
 * composition. The page route renders <NowClient /> directly — the
 * server component shell only provides the html scaffold.
 *
 * Composition rule: when lightning is recent + close, the lightning
 * card promotes itself above the hero. Everything else holds its
 * place in the bento.
 */
export function NowClient() {
  const meta = useStationMeta();
  const obsQ = useStationObs();
  const forecastQ = useForecast();
  const alertsQ = useAlerts();

  // Storm-panel state — Rain + Lightning each get their own open
  // state, hoisted above the config-error early return so the hook
  // count stays stable across renders. When the panel is rendered
  // side-by-side (`sm:` and up) the toggle handlers below propagate
  // each card's flip to its sibling so they expand and collapse as
  // a pair. When stacked (`<sm`) the cards operate independently —
  // forcing the second card open below the first just pushes
  // unrelated content further down the page.
  const [rainOpen, setRainOpen] = React.useState(false);
  const [lightningOpen, setLightningOpen] = React.useState(false);
  const [prevRainAutoOpen, setPrevRainAutoOpen] = React.useState(false);
  const [prevLightningAutoOpen, setPrevLightningAutoOpen] =
    React.useState(false);
  // Coupling threshold matches the grid's `sm:grid-cols-2`. Tailwind v4
  // default `sm` = 640px. SSR-safe; the hook returns `false` on first
  // render and updates to the real viewport on mount.
  const stormPanelSideBySide = useMediaQuery("(min-width: 640px)");

  // WebSocket lifecycle — start once we know the device id.
  React.useEffect(() => {
    if (!meta.data?.deviceId) return;
    const ws = new TempestWs();
    void ws.start(meta.data.deviceId);
    return () => ws.stop();
  }, [meta.data?.deviceId]);

  const obs = obsQ.data?.obs;

  // The observation's own `timestamp` is the actual sample time
  // (epoch seconds in the API). We render freshness against that —
  // the proxy's `fetchedAt` is when we re-served the response and can
  // lag the sample by tens of seconds during a cached window.
  const lastSampleAt = obs?.timestamp ? obs.timestamp * 1000 : 0;
  const today = forecastQ.data?.forecast?.daily?.[0] ?? null;
  const current = forecastQ.data?.current_conditions ?? null;
  const hourly = forecastQ.data?.forecast?.hourly ?? [];
  const days = forecastQ.data?.forecast?.daily ?? [];

  const configError =
    extractConfigError(meta.error) ??
    extractConfigError(obsQ.error) ??
    extractConfigError(forecastQ.error);
  if (configError) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <ConfigError message={configError} />
      </div>
    );
  }

  // Build the lightning-promotion check from the latest obs.
  const lastEpoch = obs?.lightning_strike_last_epoch ?? null;
  const lastDistKm = obs?.lightning_strike_last_distance ?? null;
  const promoteLightning = obs
    ? shouldPromoteLightning({
        lastStrikeEpochMs: lastEpoch && lastEpoch > 0 ? lastEpoch * 1000 : null,
        lastStrikeMi:
          lastDistKm != null && lastDistKm > 0 ? kmToMi(lastDistKm) : null,
      })
    : false;

  // ──────────────────────────────────────────────────────────────────
  // Storm panel — Rain + Lightning sit side-by-side at sm: and up,
  // stacked below sm. The standalone-promoted lightning row above
  // the hero (when `promoteLightning === true`) is rendered as an
  // uncontrolled <AdaptiveLightningCard /> and keeps its own state —
  // it's already special-cased and not part of the side-by-side pair.
  //
  // Coupling rule:
  //   - Side-by-side: toggling either card flips both. Avoids the
  //     "tall expanded card next to a tiny collapsed sibling"
  //     asymmetry that drove the original coupling.
  //   - Stacked (mobile): each card is independent. Forcing the
  //     second open below the first pushes unrelated content (hero,
  //     metrics, history band) further down the page for no gain.
  //
  // Auto-expand: each card responds only to its OWN trigger.
  //   - Rain: `shouldExpandRain` (any rain in the day or hour, or a
  //     non-zero current rate)
  //   - Lightning: `shouldPromoteLightning` (recent close strike)
  // Once auto-opened, never auto-collapsed — same React-docs prop-
  // change pattern AdaptiveCard uses internally for `promoted`.
  const shouldRainAutoOpen = obs
    ? shouldExpandRain({
        lastHourPrecip: obs.precip_accum_last_1hr ?? 0,
        dayTotal: obs.precip_accum_local_day ?? 0,
        rateNow: obs.precip ?? 0,
      })
    : false;
  const shouldLightningAutoOpen = obs ? promoteLightning : false;
  if (prevRainAutoOpen !== shouldRainAutoOpen) {
    setPrevRainAutoOpen(shouldRainAutoOpen);
    if (shouldRainAutoOpen) setRainOpen(true);
  }
  if (prevLightningAutoOpen !== shouldLightningAutoOpen) {
    setPrevLightningAutoOpen(shouldLightningAutoOpen);
    if (shouldLightningAutoOpen) setLightningOpen(true);
  }

  // Toggle handlers — propagate to the sibling only when the panel
  // is rendered side-by-side. On stacked mobile, each card is
  // independently driven. Defining these inline keeps the coupling
  // logic visible at the call site instead of hidden behind a
  // shared setter.
  const handleRainToggle = (next: boolean) => {
    setRainOpen(next);
    if (stormPanelSideBySide) setLightningOpen(next);
  };
  const handleLightningToggle = (next: boolean) => {
    setLightningOpen(next);
    if (stormPanelSideBySide) setRainOpen(next);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      {alertsQ.data && (
        <AlertsBanner
          alerts={alertsQ.data}
          latitude={meta.data?.latitude}
          longitude={meta.data?.longitude}
        />
      )}

      {promoteLightning && obs && (
        <AdaptiveLightningCard obs={obs} />
      )}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {obs ? (
          <HeroBlock
            obs={obs}
            today={today}
            days={days}
            hourly={hourly}
            conditions={current?.conditions ?? today?.conditions ?? null}
            iconName={current?.icon ?? today?.icon ?? null}
          />
        ) : (
          // `h-full` so the skeleton stretches to match the
          // LiveWindCard's natural height in the side-by-side row
          // (`lg:grid-cols-[3fr_2fr]`); `min-h-[230px]` keeps a
          // sensible footprint when the layout collapses to a single
          // column on smaller viewports, where there's no sibling
          // to stretch against. Without h-full the skeleton stayed
          // at 230px while the wind card rendered ~530px tall, so
          // the loading state looked truncated next to a fully-
          // rendered (empty-data) wind card.
          <Skeleton className="h-full min-h-[230px] w-full rounded-xl" />
        )}
        <LiveWindCard obs={obs ?? null} />
      </div>

      {obs ? (
        <MetricRow obs={obs} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      )}

      {/* Rain + Lightning sit side-by-side at sm: and up, stacked
          below. Toggle coupling is conditional on the side-by-side
          state (see `handleRainToggle` / `handleLightningToggle`
          above) so stacked-mode toggles operate independently. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {obs ? (
          <AdaptiveRainCard
            obs={obs}
            open={rainOpen}
            onOpenChange={handleRainToggle}
          />
        ) : (
          <Skeleton className="h-12 rounded-xl" />
        )}
        {!promoteLightning && obs ? (
          <AdaptiveLightningCard
            obs={obs}
            open={lightningOpen}
            onOpenChange={handleLightningToggle}
          />
        ) : !obs ? (
          <Skeleton className="h-12 rounded-xl" />
        ) : null}
      </div>

      {meta.data ? (
        <HorizonBand
          latitude={meta.data.latitude}
          longitude={meta.data.longitude}
        />
      ) : (
        // Reserve the band's footprint while station meta loads —
        // without this placeholder, the page reflows ~280px when
        // meta arrives. The 24h staleTime on `useStationMeta` means
        // a returning user usually sees the band immediately, but
        // a first load (or after a long absence) hits the gap.
        <Skeleton className="h-72 w-full rounded-xl" />
      )}

      {days.length > 1 ? (
        <ForecastFiveDay days={days} />
      ) : (
        <Skeleton className="h-44 w-full rounded-xl" />
      )}

      {hourly.length > 0 ? (
        <ForecastHourly hours={hourly} days={days} />
      ) : (
        // h-72 ≈ the rendered chart height (header + plot + legend).
        // Was h-40, which left ~140px to fill on data-arrival.
        <Skeleton className="h-72 w-full rounded-xl" />
      )}

      {lastSampleAt > 0 && (
        <StationHealthFooter lastSampleAt={lastSampleAt} />
      )}
    </div>
  );
}

/**
 * Pulls the latest battery reading from the history hook and
 * firmware/elevation from station meta, then forwards both to
 * `<StationHealth />`. Lives at the call site so the chips render
 * exactly when we have something to show — meta + history land
 * independently and we don't want the footer to flicker between
 * states. (TanStack dedupes the meta + history fetches with the
 * other Now-tab consumers, so this isn't an extra request.)
 */
function StationHealthFooter({ lastSampleAt }: { lastSampleAt: number }) {
  const meta = useStationMeta();
  const history = useRecentHistory(24);
  // Walk samples newest-first to find the most recent finite battery.
  // Battery slowly drifts so the latest 10-min bucket is always fresh.
  const latestBattery = React.useMemo(() => {
    const samples = history.data?.samples;
    if (!samples) return null;
    for (let i = samples.length - 1; i >= 0; i--) {
      const v = samples[i].batteryV;
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return null;
  }, [history.data?.samples]);

  return (
    <StationHealth
      lastSampleAt={lastSampleAt}
      batteryV={latestBattery}
      firmware={meta.data?.firmware ?? null}
      elevationM={meta.data?.elevationM ?? null}
      stationId={meta.data?.stationId ?? null}
    />
  );
}

/**
 * Extract a user-facing configuration error from a thrown query error.
 * The Route Handlers surface messages like "TEMPEST_TOKEN not
 * configured" or "TEMPEST_STATION_ID not configured" / "Station N not
 * found in your Tempest account"; the hooks now propagate those
 * messages verbatim (see `lib/hooks/_fetch.ts`), so a substring
 * match against the env-var names + the canonical "not found" copy
 * catches every config path.
 */
function extractConfigError(err: unknown): string | null {
  if (!err) return null;
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes("TEMPEST_TOKEN") ||
    msg.includes("TEMPEST_STATION_ID") ||
    msg.includes("not found in your Tempest account") ||
    // Server throws this with the literal `"ST"` substring — match the
    // shorter `"No Tempest"` prefix so we catch the "no ST device on
    // station N" case, which the previous matcher (`"No Tempest device
    // on station"`) failed against because of the embedded quotes.
    msg.includes("No Tempest")
  ) {
    return msg;
  }
  return null;
}
