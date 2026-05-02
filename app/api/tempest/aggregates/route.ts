/**
 * GET /api/tempest/aggregates?days=N
 *
 * Returns the station's daily-aggregate rows for the last N days.
 * Backed by Tempest's `obs_st_ext` response format which is what
 * Tempest's REST API returns natively for time windows ≥181 days.
 *
 * This is the data source for History-tab views at the 90d / YTD /
 * 1y range, and for the Now-tab "Year-to-date" tiles in the rain +
 * lightning cards.
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
// 730 cap because that's roughly the maximum useful range for
// "vs last year same period" overlays. Tempest accepts longer
// requests but the practical history window for daily aggregates
// hits diminishing returns past 2 years.
const MAX_DAYS = 730;
const DEFAULT_DAYS = 365;

// Query-param schema — see /api/tempest/history for the rationale on
// switching from `clamp` to Zod (rejection over silent clamping;
// explicit handling of NaN inputs).
const queryParams = z.object({
  days: z
    .coerce
    .number()
    .int()
    .min(MIN_DAYS)
    .max(MAX_DAYS)
    .default(DEFAULT_DAYS),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = queryParams.safeParse({
      days: url.searchParams.get("days") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: `invalid query params: ${parsed.error.message}` },
        { status: 400 },
      );
    }
    const { days } = parsed.data;

    const { device } = await resolveConfiguredStation();
    const { tz, aggregates } = await getDeviceDailyAggregates(
      device.device_id,
      days,
    );

    return NextResponse.json({
      deviceId: device.device_id,
      days,
      tz,
      count: aggregates.length,
      aggregates,
    });
  } catch (err) {
    return tempestErrorResponse(err);
  }
}
