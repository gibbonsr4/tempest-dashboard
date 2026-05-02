"use client";

import * as React from "react";
import { useTheme } from "next-themes";

/**
 * Updates `<meta name="theme-color">` whenever the resolved theme
 * changes, so iOS Safari (and other browsers that honor it) tints
 * the status bar / navigation chrome to match the active theme.
 *
 * Why dynamic instead of media-query: `<ThemeProvider />` runs
 * `enableSystem={false}` — the user's explicit toggle wins, not the
 * OS preference. So a static media-query approach (separate
 * `theme-color` tags scoped to `prefers-color-scheme`) wouldn't react
 * to the toggle. We listen to next-themes' `resolvedTheme` instead
 * and rewrite the existing meta tag's `content` attribute.
 *
 * The hex values below approximate the OKLCH `--background` tokens
 * from `app/globals.css` — they don't have to be pixel-exact (Safari
 * just uses them as a rough tint), but they should fall on the right
 * side of the light/dark divide so the system picks the right
 * status-bar text contrast.
 *
 * Renders nothing; pure DOM side effect.
 */
const THEME_COLORS = {
  // Light: oklch(0.99 0.005 80) — warm near-white.
  light: "#fcfcfa",
  // Dark: oklch(0.18 0.018 250) — dark slate with a faint blue tint.
  dark: "#161a20",
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
