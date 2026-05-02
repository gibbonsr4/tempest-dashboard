"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/**
 * Single-button theme toggle. Avoids a hydration flash by waiting until
 * `mounted` is true before reading the resolved theme.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  // Standard SSR-safe mount detection for next-themes — render the
  // neutral icon until we know which theme resolved on the client, to
  // avoid a hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  // Defer the directional aria-label until the resolved theme is
  // known. Before mount, `isDark` is computed against an unresolved
  // theme and could announce the wrong target (e.g. "switch to dark
  // theme" while dark mode is already active). Until then we use a
  // neutral label so screen-reader users don't hear a wrong cue
  // during the hydration frame.
  const ariaLabel = mounted
    ? `switch to ${isDark ? "light" : "dark"} theme`
    : "toggle theme";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={ariaLabel}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="size-11 sm:size-9"
    >
      {mounted ? (
        isDark ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )
      ) : (
        <span className="size-4" />
      )}
    </Button>
  );
}
