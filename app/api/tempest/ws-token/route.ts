/**
 * GET /api/tempest/ws-token
 *
 * Returns the personal access token to the browser so the WebSocket
 * client can connect directly to wss://ws.weatherflow.com/swd/data.
 *
 * The token is the same PAT the REST routes use server-side. It is
 * short-lived in caches by virtue of `Cache-Control: no-store`, but
 * once the browser has it (during the lifetime of the WS connection)
 * we accept that it lives in client memory. This is the trade-off the
 * user opted into in the planning phase — it's a single-user dashboard
 * for a personal station.
 *
 * SECURITY: same-origin guard. Without this, *any* origin (including a
 * page on `evil.example.com` that the user opens in another tab) can
 * fetch this route via simple GET and walk away with the long-lived
 * Tempest PAT. Browsers don't preflight a no-Authorization, no-custom-
 * header GET, so CORS alone wouldn't stop it. We instead inspect the
 * `Origin` / `Referer` headers and only honor requests coming from the
 * deployment's own origin (or none at all, which covers same-origin
 * fetch with no Referer policy and curl-from-localhost dev usage).
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json(
      { error: "cross-origin token requests are not allowed" },
      { status: 403 },
    );
  }

  const token = process.env.TEMPEST_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "TEMPEST_TOKEN not configured" },
      { status: 500 },
    );
  }
  return new NextResponse(JSON.stringify({ token }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * True when the request looks like it came from this deployment's own
 * origin (or has no `Origin` / `Referer` at all, which we treat as
 * "same-origin or trusted client" — covers same-origin `fetch()` calls
 * and dev-time curl). Cross-origin browser fetches always send `Origin`
 * (per Fetch spec for non-GET-with-CORS-safelisted requests AND for
 * any request with custom client logic), so a present-but-different
 * `Origin` is the precise tell for an attacker.
 */
function isSameOriginRequest(req: NextRequest): boolean {
  const selfOrigin = req.nextUrl.origin;
  const origin = req.headers.get("origin");
  if (origin) return origin === selfOrigin;
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === selfOrigin;
    } catch {
      return false;
    }
  }
  // No Origin and no Referer — accept. This is the curl/dev case;
  // browsers always send at least one for fetches that can read
  // responses.
  return true;
}
