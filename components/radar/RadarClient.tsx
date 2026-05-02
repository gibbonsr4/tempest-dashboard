"use client";

/**
 * Ventusky iframe embed for the Radar tab.
 *
 * Self-contained: all radar code lives under `components/radar/*` and
 * `app/radar/*`, consumes shared hooks (useStationMeta) but does not
 * push state into the zustand store or extend `lib/tempest/types.ts`,
 * and no third-party iframe deps leak into other components.
 *
 * Loading state: the iframe renders immediately once we have station
 * meta, but Ventusky's WebGL map takes a beat to boot. We track the
 * iframe document's `load` event via `onLoad` and overlay a skeleton
 * until that fires — so the user sees a real progress signal instead
 * of the bare iframe flickering with white frames during init. Note
 * `onLoad` fires when the iframe's HTML document finishes loading,
 * which precedes the WebGL canvas being interactive by another
 * fraction of a second; the visual hand-off is good enough that we
 * don't bother with an artificial delay.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { useStationMeta } from "@/lib/hooks/useStationMeta";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfigError } from "@/components/shared/ConfigError";

const VENTUSKY_BASE = "https://embed.ventusky.com/";
const DEFAULT_ZOOM = 7;

function buildVentuskyUrl(lat: number, lon: number, label: string | null) {
  const p = `${lat.toFixed(3)};${lon.toFixed(3)};${DEFAULT_ZOOM}`;
  const params = new URLSearchParams({ p, l: "radar" });
  if (label) {
    params.set("pin", `${lat.toFixed(3)};${lon.toFixed(3)};dot;${label}`);
  }
  // URLSearchParams percent-encodes the semicolons in `p` and `pin`,
  // which Ventusky accepts (their own share links do the same).
  return `${VENTUSKY_BASE}?${params.toString()}`;
}

export function RadarClient() {
  const meta = useStationMeta();
  // Track whether the iframe document has fired its `load` event.
  // Reset whenever the URL changes (station meta becoming available
  // for the first time, or the lat/lon updating) so the skeleton
  // shows again during the new load instead of revealing a stale
  // canvas. `key={url}` on the iframe element gives us a fresh DOM
  // node per URL so React re-mounts cleanly; this state just
  // mirrors the load lifecycle on the parent side.
  const [iframeLoaded, setIframeLoaded] = React.useState(false);

  // Fill all available space below the sticky header (h-14 = 3.5rem).
  // `dvh` (dynamic viewport height) accounts for mobile browser chrome
  // that auto-hides on scroll — `vh` would leave a gap when Safari's
  // address bar collapses. The iframe wrapper takes remaining space via
  // `flex-1`, leaving room for the small attribution row.
  const SHELL_CLS =
    "mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-6xl flex-col gap-2 px-4 py-3 sm:py-6";

  if (meta.error) {
    const msg = meta.error instanceof Error ? meta.error.message : String(meta.error);
    return (
      <div className={SHELL_CLS}>
        <ConfigError message={msg} />
      </div>
    );
  }

  if (!meta.data) {
    return (
      <div className={SHELL_CLS}>
        <Skeleton className="w-full flex-1 rounded-xl" />
      </div>
    );
  }

  const url = buildVentuskyUrl(
    meta.data.latitude,
    meta.data.longitude,
    meta.data.stationName ?? null,
  );

  return (
    <div className={SHELL_CLS}>
      <div className="relative flex-1 overflow-hidden rounded-xl border bg-muted">
        {/*
         * Sandbox the third-party embed: allow scripts (required for
         * the WebGL map), same-origin (required for their tile cache /
         * storage), and popups (Ventusky links open in new tabs).
         * Notably WITHOUT `allow-top-navigation` or `allow-forms` —
         * the embed has no form submission and shouldn't be able to
         * navigate the parent frame.
         */}
        <iframe
          key={url}
          src={url}
          title="Ventusky radar"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-popups"
          allow="fullscreen"
          onLoad={() => setIframeLoaded(true)}
          className={cn(
            "block h-full w-full border-0 transition-opacity duration-200",
            iframeLoaded ? "opacity-100" : "opacity-0",
          )}
        />
        {/* Skeleton overlay shown until the iframe document finishes
            loading. `absolute inset-0` puts it on top of the iframe;
            `pointer-events-none` so the user can't accidentally click
            through the skeleton mid-load. Removed from the tree once
            `iframeLoaded` flips so it stops occupying layout. */}
        {!iframeLoaded && (
          <div className="pointer-events-none absolute inset-0">
            <Skeleton className="h-full w-full rounded-xl" />
          </div>
        )}
      </div>
      <p className="shrink-0 text-right text-xs text-muted-foreground">
        Radar imagery ©{" "}
        <a
          href="https://www.ventusky.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Ventusky
        </a>
      </p>
    </div>
  );
}
