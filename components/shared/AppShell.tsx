"use client";

import * as React from "react";
import { useStationMeta } from "@/lib/hooks/useStationMeta";
import { TzProvider, browserTz } from "@/lib/tempest/tz-context";

/**
 * Client-only shell that lives just below QueryProvider in the root
 * layout. Its only job is to fetch the station meta once per session
 * and feed the resolved IANA timezone into a global `<TzProvider>`
 * so every formatter consumer — TopNav's Clock, every tab page,
 * every chrome surface — sees a single, station-correct value.
 *
 * Until station meta lands we render with the browser's tz; the
 * mismatch is brief and benign (formatters render correct strings
 * in either zone; only HorizonBand's day anchor is briefly off,
 * and HorizonBand is gated behind `meta.data` already).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const meta = useStationMeta();
  const tz = meta.data?.timezone ?? browserTz();
  return <TzProvider tz={tz}>{children}</TzProvider>;
}
