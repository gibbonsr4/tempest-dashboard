# Tempest · Personal Weather Dashboard

A modern dashboard for the WeatherFlow Tempest weather station. The **Now** tab shows current conditions — live wind,
temperature, the 5-day and hourly forecast, sunrise/sunset, lightning,
rain, AQI, severe-weather alerts, and station health. **Radar** is a
live precipitation map centered on your station. **History** is a
year-plus archive of charts with personal records and compare overlays.

![dark and light themes of the now tab](docs/screenshots/tempest-dashboard-desktop.gif)

<!-- Screenshots: replace these with real captures before publishing.
     Suggested: Now (dark, desktop), History (1y view), mobile portrait. -->
<!--
![Now tab](docs/screenshots/now-dark.png)
![History tab](docs/screenshots/history.png)
![Mobile](docs/screenshots/mobile.png)
-->

The UI is responsive, mobile-first, and themeable (light, dark, or
system). Storm panels adapt to conditions; charts scale cleanly from
phone to desktop. Once deployed, the dashboard installs to a phone's
home screen as a standalone app (PWA).

Installation is one click on Vercel (free tier) or Cloudflare Workers
— no CLI required. Docker is supported for self-hosting.

Each deployment serves a single Tempest station. Severe-weather alerts
(NWS) and AQI (AirNow) cover the US only.

## Features

### Now tab

- Live wind gauge — updates every few seconds via the Tempest WebSocket
- Current temperature, feels-like, conditions, and weather icon
- Sunrise/sunset arc with sun position and moon phase
- 5-day forecast and hourly forecast
- Tiles for pressure, humidity, solar/UV, and AQI (US-only)
- Rain and lightning panels that auto-expand when there's data to show
- Severe-weather alert banner (US-only)
- Station-health row: last-sample timestamp, battery, firmware,
  elevation, and station ID

### Radar tab

A live precipitation radar map centered on your station, with a pin
labeled by station name. Embedded from
[Ventusky](https://www.ventusky.com/) — pan, zoom, and time-scrub
behave the same as their standalone app.

### History tab

- Charts for temperature, humidity, pressure, rain, wind average, and
  wind gust
- Range picker: 24h / 7d / 30d / 90d / YTD / 1y
- Compare overlay: previous period (short ranges) or same period last
  year (long ranges)
- Wind rose
- Personal-records strip (today's, weekly, monthly, and yearly peaks)

### Other

- Installable as a PWA — opens standalone on your phone's home screen
  with no browser chrome
- Light, dark, and system themes; user toggle persists in localStorage
- No first-party telemetry — no trackers, no analytics, secrets stay
  server-side

## What you'll need

- A WeatherFlow Tempest weather station
- A Tempest personal access token (free, from your account — instructions below)
- An AirNow API key (free, instant request)
- 5 minutes

## Deploy

Pick the path that matches your comfort level. **Tier 1 and 2 require
no CLI** — both are GitHub-connected, zero-terminal flows.

### 🚀 Vercel (easiest, ~5 min)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgibbonsr4%2Ftempest-dashboard&env=TEMPEST_TOKEN,TEMPEST_STATION_ID,AIRNOW_API_KEY,NWS_USER_AGENT,NEXT_PUBLIC_DEFAULT_THEME&envDescription=The%20first%20four%20vars%20are%20required.%20NEXT_PUBLIC_DEFAULT_THEME%20is%20optional%20%28light%20%2F%20dark%20%2F%20system%2C%20defaults%20to%20system%29.&envLink=https%3A%2F%2Fgithub.com%2Fgibbonsr4%2Ftempest-dashboard%23where-to-get-the-env-vars)

1. Click the button → Vercel forks the repo to your GitHub.
2. Vercel prompts for the four environment variables; paste them in.
3. Click **Deploy**. Vercel gives you a `your-app.vercel.app` URL.
4. (Optional) add a custom domain via Vercel's dashboard.

### 🌩️ Cloudflare Workers (no CLI, ~10 min)

1. Sign in to Cloudflare → **Workers & Pages** → **Create**.
2. Click **Connect to Git** and select your fork of this repo.
3. **Set Build command to `pnpm cf:build`** (Cloudflare's auto-detect
   doesn't know about OpenNext; the default `npm run build` won't
   produce the worker bundle).
4. **Worker name must match `wrangler.jsonc`'s `name` field
   (`tempest`)** — either name your worker `tempest` in the
   dashboard, or edit `wrangler.jsonc` to match the name you choose.
5. Go to **Settings → Variables** and add the four environment
   variables (see [Where to get the env vars](#where-to-get-the-env-vars)).
6. Push to `main` — Cloudflare auto-deploys on every push.

### 🐳 Self-host (Docker, ~10 min)

```bash
# Grab the example compose file from the repo
curl -O https://raw.githubusercontent.com/gibbonsr4/tempest-dashboard/main/docker-compose.example.yml
mv docker-compose.example.yml docker-compose.yml

# Edit it — paste your env vars under `environment:`
$EDITOR docker-compose.yml

# Bring it up (builds the image, then starts the container)
docker compose up -d
```

The dashboard listens on port 3000. Reverse-proxy via your existing
httpd (Nginx, Caddy, Apache) for HTTPS, or visit
`http://<host>:3000` directly on a LAN.

If you'd rather run Node directly (no Docker):
`pnpm install && pnpm build && pnpm start` — same env vars, same
port, reverse-proxy from your existing httpd.

## Where to get the env vars

### `TEMPEST_TOKEN` (required)

Sign in to [tempestwx.com](https://tempestwx.com) →
**Settings → API → Generate Token**. Copy the token; you only see
it once. It's a personal access token tied to your account.

### `TEMPEST_STATION_ID` (required)

The numeric ID at the end of your station's URL on tempestwx.com:

```
https://tempestwx.com/station/12345
                              ^^^^^
                              this number
```

### `AIRNOW_API_KEY` (required for the AQI tile)

Free, instant signup at
[docs.airnowapi.org/account/request](https://docs.airnowapi.org/account/request).
You'll receive the key by email. The dashboard caches AQI for 1 hour;
the daily request count stays well under the free tier. AirNow covers
the US only — non-US users can still set the key, but the AQI tile
won't show readings.

### `NWS_USER_AGENT` (required for production)

The National Weather Service requires a User-Agent header identifying
the consumer. Format:

```
your-app-name (your-email@example.com)
```

NWS rejects production requests without it. The dev server has a
self-describing fallback, but please set this for any deployed
instance — it's their TOS. The NWS only covers the US, so non-US
deployments won't see severe-weather banners.

### `NEXT_PUBLIC_DEFAULT_THEME` (optional)

First-paint theme. Three valid values:

| Value | Behavior |
|---|---|
| `system` (default) | Follow the OS's `prefers-color-scheme`; flips automatically when the user's OS theme changes |
| `dark` | Dark mode regardless of OS preference |
| `light` | Light mode regardless of OS preference |

Whatever the default, the user can always override via the toggle in
the top nav, and their choice persists in `localStorage`. The
`NEXT_PUBLIC_` prefix is required so the value is baked into the
client bundle.

## Install on your phone

Once your dashboard is deployed, visit the URL on your phone:

- **Android (Chrome):** an "Add to Home Screen" prompt appears
  automatically after a few seconds. Tap it.
- **iOS (Safari):** tap the **Share** button → **Add to Home Screen**.

The app then opens as a standalone window with no browser chrome,
its own home-screen icon, and the dashboard's copper theme color in
the status bar.

## Privacy

This dashboard makes no first-party telemetry calls. The deploys
behave as follows:

- **Vercel** — Vercel Analytics is opt-in and off by default in this
  codebase. Vercel does collect platform-level access logs
  (server response times, etc.) per their standard policy.
- **Cloudflare** — observability is enabled in `wrangler.jsonc` so
  you can see request logs and traces in your own Cloudflare account.
  Those logs stay in your account.
- **Docker self-host** — no telemetry. Logs go to stdout / wherever
  Docker is configured to send them.

Secrets (the four env vars) live server-side only. The single
exception is the WebSocket token, which the browser fetches from
`/api/tempest/ws-token` so the rapid-wind feed can connect direct to
`wss://ws.weatherflow.com`. That token is short-lived and scoped to
the station device — losing it doesn't expose your account.

## Local development

```bash
# Prerequisites:
#   - Node 20+
#   - pnpm 10+ (`brew install pnpm` or `corepack enable`)

git clone https://github.com/gibbonsr4/tempest-dashboard.git
cd tempest-dashboard
pnpm install

cp .env.example .env.local
# edit .env.local — fill in the four values from "Where to get the env vars"

pnpm dev
```

Open <http://localhost:3000>. The page follows your OS color scheme
by default (toggle in the header to override). The live wind gauge
populates within a few seconds as the WebSocket subscription opens.

### Verifying the build

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # ESLint (Next config + react-hooks rules)
pnpm test        # Vitest
pnpm build       # Production Next build
```

### Reproducing the Cloudflare deploy locally

```bash
pnpm cf:build                                 # opennextjs-cloudflare build
pnpm exec wrangler dev --local --port 8787    # serves the worker bundle
```

This exercises the OpenNext bundle the same way Cloudflare Workers
does in production, including the edge-runtime constraints. The
`pnpm dev` server doesn't run the OpenNext bundle, so a green dev
run does not imply a green Cloudflare deploy.

## Customizing

Everything user-facing is plain TypeScript / Tailwind / CSS variables —
no codegen, no DSLs.

- **Heuristics** — phrasing thresholds (UV bands, humidity bands,
  the "Dangerous heat" cutoff, etc.) live in
  `lib/tempest/interpret.ts`. They use NWS / EPA / NOAA conventions
  by default. Pure functions; edit the thresholds or the language to
  taste.
- **Theme tokens** — copper accent, dark/light backgrounds, status
  colors, etc. live in `app/globals.css` as OKLCH variables. Edit
  the values; everything propagates.
- **Tiles** — each metric is its own component under
  `components/now/`. Add or remove by editing `<MetricRow />`.
- **Upcoming eclipses** — the next-eclipse strip in the celestial-
  details panel reads from a static dataset at
  `lib/astronomy/eclipses.ts`, curated from NASA's Five Millennium
  Catalog. Covers ~10 years through 2036 today; extend the array
  with future entries from the NASA decade tables
  (`eclipse.gsfc.nasa.gov`) when the tail runs short, or swap to
  a computational backend (`astronomy-engine`) if zero-maintenance
  becomes more compelling than the small TS file.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript strict |
| UI | Tailwind v4 + shadcn/ui |
| State | Zustand (one store: WS, rapid-wind buffer, prefs) |
| Server state | TanStack Query (browser polling + WS push) |
| Charts | Recharts |
| Astronomy | `suncalc` |
| Animations | Framer Motion |
| Theme | `next-themes`, system default, copper accent (`oklch(0.72 0.12 55)`) |
| Build adapters | OpenNext-Cloudflare, Vercel native, Docker standalone |

External APIs (all behind server-side Route Handlers — secrets never
reach the browser):

| Source | Endpoint | Cache |
|---|---|---|
| Tempest REST | `/observations/station/{id}` | 30s |
| Tempest REST | `/stations` | 24h |
| Tempest REST | `/better_forecast?station_id={id}` | 10min |
| Tempest WS | `wss://ws.weatherflow.com/swd/data` | persistent |
| NWS | `api.weather.gov/alerts/active` | 5min |
| AirNow | `airnowapi.org/aq/observation/latLong/current` | 1h |

## Future ideas

- **PWA offline shell** — render last-cached data when the device is
  offline (currently the dashboard fails to load without network)
- **Push notifications** — phone alert when NWS issues a Severe or
  Extreme alert for the station's location

## License

MIT — see [LICENSE](LICENSE).
