/**
 * GET /api/tempest/history?hours=24
 *
 * Returns a downsampled rolling window of device observations powering
 * the metric-tile sparklines on the Now tab. The proxy handles two
 * concerns the client shouldn't:
 *
 *   1. Resolving device_id from the cached station meta.
 *   2. Downsampling 1-min raw obs to ~144 buckets so the JSON payload
 *      is small enough that the page-load cost is invisible.
 *
 * Default 24-hour window keeps the sparklines meaningful (a full
 * day-night cycle of pressure, humidity, etc.) without forcing the
 * 30-day chunked fetch the History tab uses for long ranges.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getDeviceObservations,
  resolveConfiguredStation,
  tempestErrorResponse,
} from "@/lib/tempest/server-client";
import { downsample } from "@/lib/tempest/downsample";

const DEFAULT_HOURS = 24;
const MAX_HOURS = 24 * 30; // thirty days — past that the response thins
                           // out enough that the chart isn't useful and
                           // we'd want a daily-aggregate path instead.
const DEFAULT_BUCKETS = 144; // ≈ every 10 minutes for 24h

// Query-param schema. `z.coerce.number()` accepts the URLSearchParams
// string, parses it, and rejects non-numerics cleanly. Each field has
// the same min/max bounds the prior `clamp` helper enforced — but now
// values outside the range are rejected with a 400 instead of silently
// clamped, and NaN inputs surface as a Zod error instead of falling
// through to the lower bound. `before` shifts the time_end window
// backward by N hours, so a call with `hours=168&before=168` returns
// the 7 days that ended 7 days ago — the input the History tab's
// compare-overlay path wants. Default 0 means "ending now".
const queryParams = z.object({
  hours: z.coerce.number().int().min(1).max(MAX_HOURS).default(DEFAULT_HOURS),
  buckets: z.coerce.number().int().min(6).max(720).default(DEFAULT_BUCKETS),
  before: z.coerce.number().int().min(0).max(MAX_HOURS).default(0),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = queryParams.safeParse({
      hours: url.searchParams.get("hours") ?? undefined,
      buckets: url.searchParams.get("buckets") ?? undefined,
      before: url.searchParams.get("before") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: `invalid query params: ${parsed.error.message}` },
        { status: 400 },
      );
    }
    const { hours, buckets, before } = parsed.data;

    // R13: cap the total reach. `before + hours` is how far back we go
    // from now; past MAX_HOURS the upstream response gets truncated
    // silently. Reject explicitly so the client sees a clear error.
    if (before + hours > MAX_HOURS) {
      return NextResponse.json(
        {
          error: `before + hours (${before + hours}) exceeds MAX_HOURS (${MAX_HOURS})`,
        },
        { status: 400 },
      );
    }

    const { device } = await resolveConfiguredStation();

    const nowSec = Math.floor(Date.now() / 1000);
    const endSec = nowSec - before * 3600;
    const startSec = endSec - hours * 3600;
    const samples = await getDeviceObservations(
      device.device_id,
      startSec,
      endSec,
    );

    return NextResponse.json({
      deviceId: device.device_id,
      hours,
      buckets,
      before,
      samples: downsample(samples, buckets),
    });
  } catch (err) {
    return tempestErrorResponse(err);
  }
}
