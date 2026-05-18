/**
 * GET /api/tempest/aggregates?days=N&before=M
 *
 * Returns the station's daily-aggregate rows for an N-day window
 * ending M days ago (default M=0 = ending now). Backed by Tempest's
 * `obs_st_ext` response format which is what Tempest's REST API
 * returns natively for time windows ≥181 days.
 *
 * This is the data source for History-tab views at the 90d / YTD /
 * 365d / 12mo ranges, the 12mo "vs previous 12 months" compare
 * overlay (uses `before=365`), and the Now-tab "Year-to-date" tiles
 * in the rain + lightning cards.
 *
 * Why ≥181 days only: Tempest auto-buckets observations based on
 * requested range (1d→1min, 5d→5min, 30d→30min, 180d→3hr,
 * 181d+→daily). Anything ≤180 days returns sub-daily `obs_st` data
 * which the existing /api/tempest/history endpoint already handles
 * via its 30-day cap. The two endpoints stay non-overlapping by
 * convention.
 *
 * Cache: 6h server-side via `tempestFetch`'s revalidate. Daily rows
 * change at most twice a day (yesterday finalizes at local midnight;
 * today's partial row updates ~minutely). 6h hits the sweet spot of
 * "freshness for the YTD tile" + "no hammering Tempest's rate limit".
 *
 * No Cloudflare-specific bindings required — runs on stock Next.js
 * route handler with revalidate-cached fetch. KV / D1 / cron are not
 * needed for this endpoint to function.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getDeviceDailyAggregates,
  resolveConfiguredStation,
  tempestErrorResponse,
} from "@/lib/tempest/server-client";

// 181 minimum because that's where Tempest's obs_st_ext kicks in.
// Anything shorter returns the wrong response shape and the decoder
// would refuse it.
const MIN_DAYS = 181;
// 730 cap on a single window — that's roughly the maximum useful
// range for "vs last year same period" overlays in one fetch.
// Tempest accepts longer requests but the practical history window
// for daily aggregates hits diminishing returns past 2 years. The
// combined reach (`before + days`) is allowed up to 2*MAX_DAYS so
// the 12mo compare overlay can fetch a 365-day window that ends
// ~365 days ago without a second cap bump.
const MAX_DAYS = 730;
const DEFAULT_DAYS = 365;

// Query-param schema — see /api/tempest/history for the rationale on
// switching from `clamp` to Zod (rejection over silent clamping;
// explicit handling of NaN inputs). `before` mirrors the same param
// on /api/tempest/history: shifts time_end backward by N days so
// `?days=365&before=365` returns the daily window that ENDED 365
// days ago — what the 12mo "vs previous 12 months" overlay wants.
const queryParams = z.object({
  days: z
    .coerce
    .number()
    .int()
    .min(MIN_DAYS)
    .max(MAX_DAYS)
    .default(DEFAULT_DAYS),
  before: z.coerce.number().int().min(0).max(MAX_DAYS).default(0),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = queryParams.safeParse({
      days: url.searchParams.get("days") ?? undefined,
      before: url.searchParams.get("before") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: `invalid query params: ${parsed.error.message}` },
        { status: 400 },
      );
    }
    const { days, before } = parsed.data;

    // Combined-reach cap: `before + days` is how far back from now
    // the requested window starts. Allow up to 2*MAX_DAYS so the
    // 12mo compare overlay (365-day window ending ~365 days ago)
    // fits cleanly. Anything past that pushes into Tempest territory
    // where rate-limit + cache costs aren't worth the marginal data.
    if (before + days > 2 * MAX_DAYS) {
      return NextResponse.json(
        {
          error: `before + days (${before + days}) exceeds 2 * MAX_DAYS (${2 * MAX_DAYS})`,
        },
        { status: 400 },
      );
    }

    const { device } = await resolveConfiguredStation();
    const { tz, aggregates } = await getDeviceDailyAggregates(
      device.device_id,
      days,
      before,
    );

    return NextResponse.json({
      deviceId: device.device_id,
      days,
      before,
      tz,
      count: aggregates.length,
      aggregates,
    });
  } catch (err) {
    return tempestErrorResponse(err);
  }
}
