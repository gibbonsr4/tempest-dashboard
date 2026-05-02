/**
 * Browser WebSocket client for the Tempest live feed.
 *
 * Connects to wss://ws.weatherflow.com/swd/data with a token retrieved
 * from `/api/tempest/ws-token`. Subscribes to the rapid-wind feed for
 * the supplied device, validates each message with Zod, and pushes
 * decoded samples into the Zustand store.
 *
 * Reconnect uses exponential backoff with jitter, capped at 30s. After
 * five consecutive failures, the gap stays at 30s and the connection
 * pill surfaces "live wind unavailable" via the store's lastError.
 *
 * Lifecycle invariants (B3):
 *   - Every `setTimeout` for reconnect is tracked in `reconnectTimer`
 *     and cleared on both `stop()` and `start()`. Without this, a
 *     reconnect scheduled before `stop()` could fire after, opening a
 *     ghost socket on a "stopped" instance.
 *   - Every socket-event handler captures its own `socket` reference
 *     and early-returns if `this.socket` has moved on. Without this,
 *     stale `error` / `close` events from a torn-down socket could
 *     schedule duplicate reconnects, fanning a single outage into
 *     multiple concurrent sessions.
 */

"use client";

import { wsMessage } from "./schemas";
import type { StrikeSample, WindSample } from "./types";
import { useApp } from "@/lib/store";

const WS_URL = "wss://ws.weatherflow.com/swd/data";
const MAX_BACKOFF_MS = 30_000;
const FAIL_PIN_AFTER = 5;
// Re-fetch the WS token at most once every 24 hours. Tempest's PAT
// doesn't auto-rotate but `TEMPEST_TOKEN` could be changed
// server-side; without a TTL the WS would reuse a stale value
// indefinitely until the user reloaded.
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
// WebSocket close codes that signal an auth/credential problem and
// should invalidate the cached token before the next connect. 1008
// is the generic policy violation; 4001 is what Tempest returns for
// an invalid token.
const AUTH_FAILURE_CLOSE_CODES = new Set([1008, 4001]);

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class TempestWs {
  private socket: WebSocket | null = null;
  private deviceId: number | null = null;
  private attempt = 0;
  private stopped = false;
  private cachedToken: string | null = null;
  /** Epoch ms when `cachedToken` was fetched. Used to expire the
   *  cache after `TOKEN_TTL_MS` so a server-side rotation doesn't
   *  leave the WS reusing a stale credential until page reload. */
  private cachedTokenAt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Open the connection (or restart it if already running). */
  async start(deviceId: number): Promise<void> {
    this.stop();
    this.deviceId = deviceId;
    this.stopped = false;
    this.attempt = 0;
    await this.connect();
  }

  /** Tear down the connection and stop reconnect attempts. */
  stop(): void {
    this.stopped = true;
    this.clearReconnectTimer();
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      try {
        this.socket.close();
      } catch {
        // Closing an already-closing socket throws on some browsers; ignore.
      }
    }
    this.socket = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async fetchToken(): Promise<string> {
    const now = Date.now();
    if (
      this.cachedToken &&
      now - this.cachedTokenAt < TOKEN_TTL_MS
    ) {
      return this.cachedToken;
    }
    const res = await fetch("/api/tempest/ws-token", { cache: "no-store" });
    if (!res.ok) throw new Error(`ws-token endpoint ${res.status}`);
    const json = (await res.json()) as { token?: string };
    if (!json.token) throw new Error("ws-token endpoint returned no token");
    this.cachedToken = json.token;
    this.cachedTokenAt = now;
    return json.token;
  }

  /** Drop the cached token so the next connect fetches a fresh one.
   *  Called from the close-handler when Tempest signals an auth
   *  failure (close codes 1008 / 4001). */
  private invalidateToken(): void {
    this.cachedToken = null;
    this.cachedTokenAt = 0;
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.deviceId == null) return;
    const { setWsStatus } = useApp.getState();
    setWsStatus("connecting");

    let token: string;
    try {
      token = await this.fetchToken();
    } catch (err) {
      if (this.stopped) return;
      setWsStatus("closed", err instanceof Error ? err.message : "ws token error");
      this.scheduleReconnect();
      return;
    }

    if (this.stopped) return;

    const socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    this.socket = socket;
    const id = this.deviceId;

    socket.addEventListener("open", () => {
      // Stale event from a torn-down socket — ignore.
      if (this.socket !== socket) return;
      this.attempt = 0;
      setWsStatus("open");
      // Subscribe only to the rapid-wind feed. obs_st was previously
      // requested via `listen_start` but never consumed by any UI;
      // dropping it shrinks both the wire chatter and the parse cost.
      // Re-add when a metric tile actually wants <30s freshness.
      socket.send(
        JSON.stringify({
          type: "listen_rapid_start",
          device_id: id,
          id: randomId(),
        }),
      );
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      let raw: unknown;
      try {
        raw = JSON.parse(event.data as string);
      } catch {
        return;
      }
      const parsed = wsMessage.safeParse(raw);
      if (!parsed.success) return;
      const msg = parsed.data;
      const state = useApp.getState();
      switch (msg.type) {
        case "rapid_wind": {
          const sample: WindSample = {
            ts: msg.ob[0] * 1000,
            mps: msg.ob[1],
            dirDeg: msg.ob[2],
          };
          state.pushRapidWind(sample);
          break;
        }
        case "evt_strike": {
          const sample: StrikeSample = {
            ts: msg.evt[0] * 1000,
            distanceKm: msg.evt[1],
            energy: msg.evt[2],
          };
          state.pushStrike(sample);
          break;
        }
        // evt_precip, ack, connection_opened — currently no UI
        // consumers in v1; observed silently. Adding handlers later is
        // additive (no shape changes to the store).
        default:
          break;
      }
    });

    const onCloseOrError = (errMsg?: string) => {
      // Stale event from a previous socket — ignore so we don't
      // schedule duplicate reconnects.
      if (this.socket !== socket) return;
      setWsStatus("closed", errMsg);
      this.scheduleReconnect();
    };
    socket.addEventListener("close", (e) => {
      // Auth-failure close codes (Tempest's 4001 + the generic
      // policy-violation 1008) mean the cached token is no longer
      // valid — drop it so the next reconnect attempt fetches a
      // fresh one from `/api/tempest/ws-token`.
      if (AUTH_FAILURE_CLOSE_CODES.has(e.code)) {
        this.invalidateToken();
      }
      onCloseOrError();
    });
    socket.addEventListener("error", () => onCloseOrError("ws error"));
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.clearReconnectTimer();
    const pinned = this.attempt >= FAIL_PIN_AFTER;
    const base = pinned
      ? MAX_BACKOFF_MS
      : Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt);
    const delay = base + Math.random() * 500;
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }
}
