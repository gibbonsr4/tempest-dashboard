/**
 * OpenNext-Cloudflare adapter config. Empty defaults are sufficient
 * for this dashboard.
 *
 * Do NOT add `export const runtime = "edge"` to route handlers — the
 * Cloudflare adapter bundles routes for the Node runtime (with
 * `nodejs_compat`), and the edge-runtime declaration breaks the
 * loader at runtime (`Cannot read properties of undefined (reading
 * 'default')` from `interopDefault` / `loadComponentsImpl`). See
 * AGENTS.md "Cloudflare Workers deploy".
 */

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
