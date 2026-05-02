/**
 * TanStack Query client factory + provider. Creating the client inside
 * the provider component (rather than at module scope) keeps each
 * server-rendered page request isolated; the browser caches a single
 * instance for the session.
 */

"use client";

import {
  QueryClient,
  QueryClientProvider,
  isServer,
} from "@tanstack/react-query";
import * as React from "react";

// Lazy-load the devtools so the production bundle doesn't ship the
// (~50 KB gzipped) devtools UI. The dynamic import is gated by
// `NODE_ENV` and only fires on the client; bundlers tree-shake the
// import out of production builds entirely.
const ReactQueryDevtools = React.lazy(() =>
  import("@tanstack/react-query-devtools").then((m) => ({
    default: m.ReactQueryDevtools,
  })),
);

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Conservative defaults — individual hooks override per-endpoint
        // staleTime to align with the server-side revalidate cadence.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 2,
      },
    },
  });
}

let browserClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  if (!browserClient) browserClient = makeQueryClient();
  return browserClient;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const client = getQueryClient();
  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV !== "production" && (
        <React.Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
        </React.Suspense>
      )}
    </QueryClientProvider>
  );
}
