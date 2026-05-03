"use client";

import * as React from "react";
import { useTheme } from "next-themes";

/**
 * Updates `<meta name="theme-color">` whenever the resolved theme
 * changes, so iOS Safari (and other browsers that honor it) tints
 * the status bar / navigation chrome to match the active theme.
 *
 * Two-stage strategy paired with the synchronous script in
 * `app/layout.tsx`:
 *
 *   1. **First paint** — the inline `<script>` in `<head>` reads
 *      localStorage + the env-var default + (when relevant)
 *      `prefers-color-scheme` and SETS the meta tag's content
 *      synchronously, before iOS Safari samples it for the status
 *      bar. This is the load-bearing fix for the "wrong color stuck
 *      behind the dynamic island" bug — `useEffect` runs too late.
 *
 *   2. **Mid-session toggle** — this component listens to
 *      next-themes' `resolvedTheme` and rewrites the meta tag on
 *      change. Most browsers honor the live mutation; iOS Safari
 *      may keep the old status-bar tint until the next navigation
 *      (a known iOS limitation), but the underlying meta tag is
 *      kept consistent for any browser that does observe it.
 *
 * Hex values are the sRGB equivalents of the OKLCH `--background`
 * tokens from `app/globals.css` and MUST stay in sync with the
 * literals in `themeColorScript` over in `app/layout.tsx`.
 *
 * Renders nothing; pure DOM side effect.
 */
const THEME_COLORS = {
  // Light: oklch(0.99 0.005 80)
  light: "#fefbf8",
  // Dark: oklch(0.18 0.018 250)
  dark: "#0b1219",
} as const;

export function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();

  React.useEffect(() => {
    const color =
      resolvedTheme === "light" ? THEME_COLORS.light : THEME_COLORS.dark;
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = color;
  }, [resolvedTheme]);

  return null;
}
