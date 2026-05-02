/**
 * Station-timezone context — every component that formats time reads
 * its tz from here rather than from a module-level constant. The tz
 * itself comes from the Tempest API (`/stations` returns it), so any
 * deployment of this dashboard renders correctly for its own station
 * without needing to hardcode an IANA name in code.
 *
 * Usage at the top of each tab:
 *
 *   <TzProvider tz={meta.data?.timezone ?? browserTz()}>
 *     ...
 *   </TzProvider>
 *
 * Consumers:
 *
 *   const tz = useStationTz();
 *   formatClock(ts, tz);
 *
 * Calling `useStationTz()` outside a TzProvider throws — that's
 * deliberate. A silent fallback to a hardcoded IANA name would render
 * timestamps in the wrong zone for any station that happens to live
 * elsewhere; better to fail loudly than to drift quietly.
 */

"use client";

import * as React from "react";

const TzContext = React.createContext<string | null>(null);

export function TzProvider({
  tz,
  children,
}: {
  tz: string;
  children: React.ReactNode;
}) {
  return <TzContext.Provider value={tz}>{children}</TzContext.Provider>;
}

export function useStationTz(): string {
  const tz = React.useContext(TzContext);
  if (tz == null) {
    throw new Error(
      "useStationTz() must be used inside <TzProvider>. " +
        "Wrap your tab root in <TzProvider tz={meta.timezone ?? browserTz()}>.",
    );
  }
  return tz;
}

/**
 * Best-effort runtime fallback for the brief window before station
 * meta has loaded. Resolves to the browser's tz (or the server's tz
 * during SSR — typically UTC on Cloudflare Workers, which is fine
 * since the value is replaced as soon as `useStationMeta()` returns).
 */
export function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}
