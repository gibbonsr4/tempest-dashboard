"use client";

import * as React from "react";

/**
 * Subscribe to a CSS media query. Returns whether the query currently
 * matches the viewport.
 *
 * Implemented via `useSyncExternalStore` so subscription + snapshot
 * read are colocated and React 19's strictness around effects
 * (specifically `react-hooks/set-state-in-effect`) doesn't flag the
 * pattern. SSR-safe: `getServerSnapshot` returns `false` so server
 * render assumes no match — components depending on this hook should
 * render mobile-first defaults for the first paint.
 *
 * Listener stays subscribed for the component's lifetime so resize /
 * orientation-change events flip the boolean live without polling.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (notify: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    [query],
  );

  const getSnapshot = React.useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );

  // Server has no viewport; default to "doesn't match" so consumers
  // pick their narrow-screen branch during SSR and hydrate from there.
  const getServerSnapshot = () => false;

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
