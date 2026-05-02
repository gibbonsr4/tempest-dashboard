"use client";

import { useReducedMotion } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Subtle live-status indicator for the WebSocket connection. Renders a
 * pulse + label in copper when the live feed is open, muted-grey when
 * idle/connecting/closed.
 *
 * Accessibility / behavior:
 *
 * - **Reduced motion**: the pulsing `animate-ping` halo only
 *   renders when the user hasn't requested reduced motion. Otherwise
 *   the dot stays static; users opting out of motion shouldn't see a
 *   perpetual heartbeat in the persistent nav chrome.
 *
 * - **lastError surface**: the store keeps the most recent WS
 *   error message in `ws.lastError`, but the pill only ever showed
 *   "Offline" — leaving the user without any clue about whether the
 *   feed is retrying, misconfigured, or permanently blocked. We
 *   surface that message in a tooltip when status is `closed`.
 */
export function ConnectionPill({ className }: { className?: string }) {
  const { status, lastError } = useApp(
    useShallow((s) => ({ status: s.ws.status, lastError: s.ws.lastError })),
  );
  const reduce = useReducedMotion();

  const label =
    status === "open"
      ? "Live"
      : status === "connecting"
        ? "Connecting…"
        : status === "closed"
          ? "Offline"
          : "Idle";

  const live = status === "open";

  const pill = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-card/60 px-1.5 py-1.5 text-xs sm:px-2.5 sm:py-1",
        live ? "border-primary/40 text-primary" : "border-border text-muted-foreground",
        className,
      )}
      aria-label={label}
      aria-live="polite"
    >
      <span
        className={cn(
          "relative inline-flex size-1.5 rounded-full",
          live ? "bg-primary" : "bg-muted-foreground",
        )}
      >
        {live && !reduce && (
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
        )}
      </span>
      <span className="sr-only sm:not-sr-only">{label}</span>
    </span>
  );

  // Only wrap in a tooltip when there's actually something to surface.
  // Wrapping unconditionally would inject extra focusable wrappers
  // around an otherwise non-interactive element.
  if (status === "closed" && lastError) {
    return (
      <Tooltip>
        <TooltipTrigger
          className="cursor-help rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Live feed offline: ${lastError}`}
        >
          {pill}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {lastError}
        </TooltipContent>
      </Tooltip>
    );
  }

  return pill;
}
