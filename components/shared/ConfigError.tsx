"use client";

import { AlertCircle } from "lucide-react";

/**
 * Banner shown when a configuration error prevents the dashboard from
 * talking to the upstream APIs. Renders inline setup copy instead of
 * letting the page fail with a stack trace.
 *
 * Recognized cases:
 *   - missing/invalid `TEMPEST_TOKEN`
 *   - missing/invalid `TEMPEST_STATION_ID` (or station not found in
 *     the user's account)
 *
 * Layout: per-credential "where to get it" copy first, then a
 * `<PlatformGuide />` listing the four common deploy targets (local
 * dev, Vercel, Cloudflare, Docker) and where each one stores
 * environment variables. The platform guide is credential-agnostic —
 * the actual "set-it-here" instructions are platform-bound, not
 * credential-bound, so the same block renders regardless of which
 * env var is missing.
 */
export function ConfigError({ message }: { message: string }) {
  const lower = message.toLowerCase();
  const isToken = lower.includes("tempest_token");
  const isStationId =
    lower.includes("tempest_station_id") ||
    lower.includes("not found in your tempest account") ||
    lower.includes("no tempest device on station");

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <div className="flex items-start gap-3">
        <AlertCircle
          className="mt-0.5 size-4 shrink-0 text-destructive"
          aria-hidden
        />
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="font-medium">Configuration error</p>
            <p className="text-muted-foreground">{message}</p>
          </div>

          {isToken && (
            <p className="text-muted-foreground">
              Generate a personal access token at{" "}
              <a
                className="text-primary underline-offset-2 hover:underline"
                href="https://tempestwx.com/settings/tokens"
                target="_blank"
                rel="noreferrer"
              >
                tempestwx.com/settings/tokens
              </a>{" "}
              and save it as{" "}
              <code className="rounded bg-muted px-1">TEMPEST_TOKEN</code>.
            </p>
          )}

          {isStationId && (
            <p className="text-muted-foreground">
              Find your station id in the URL when viewing your station on{" "}
              <a
                className="text-primary underline-offset-2 hover:underline"
                href="https://tempestwx.com"
                target="_blank"
                rel="noreferrer"
              >
                tempestwx.com
              </a>{" "}
              — the number after{" "}
              <code className="rounded bg-muted px-1">/station/</code> — and
              save it as{" "}
              <code className="rounded bg-muted px-1">TEMPEST_STATION_ID</code>.
            </p>
          )}

          <PlatformGuide />
        </div>
      </div>
    </div>
  );
}

/**
 * Per-platform "where do I add an environment variable?" reference.
 * Always shown alongside a `<ConfigError />` so a user landing here
 * from any deploy target sees their own setup pattern. Links jump
 * directly to each platform's own env-var docs so the user doesn't
 * have to hunt for the right settings page.
 */
function PlatformGuide() {
  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3 text-xs">
      <p className="font-medium text-foreground">
        Where to set environment variables
      </p>
      <ul className="space-y-1.5 text-muted-foreground">
        <li>
          <strong className="text-foreground">Local dev:</strong> edit{" "}
          <code className="rounded bg-muted px-1">.env.local</code> in your
          project root, then restart the dev server.
        </li>
        <li>
          <strong className="text-foreground">Vercel:</strong> project →{" "}
          <a
            className="text-primary underline-offset-2 hover:underline"
            href="https://vercel.com/docs/projects/environment-variables"
            target="_blank"
            rel="noreferrer"
          >
            Settings → Environment Variables
          </a>
          .
        </li>
        <li>
          <strong className="text-foreground">Cloudflare Workers:</strong>{" "}
          worker →{" "}
          <a
            className="text-primary underline-offset-2 hover:underline"
            href="https://developers.cloudflare.com/workers/configuration/environment-variables/"
            target="_blank"
            rel="noreferrer"
          >
            Settings → Variables
          </a>
          .
        </li>
        <li>
          <strong className="text-foreground">Docker:</strong> edit your{" "}
          <code className="rounded bg-muted px-1">docker-compose.yml</code>{" "}
          env section, then{" "}
          <code className="rounded bg-muted px-1">docker compose up -d</code>.
        </li>
      </ul>
    </div>
  );
}
