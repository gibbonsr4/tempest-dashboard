/**
 * Wrapper around `next-themes`. Default theme + whether to honor
 * the OS's `prefers-color-scheme` are read from the
 * `NEXT_PUBLIC_DEFAULT_THEME` env var:
 *
 *   - "light"  → defaults to light, OS preference ignored
 *   - "dark"   → defaults to dark, OS preference ignored (DEFAULT)
 *   - "system" → defaults to OS preference; user can still override
 *                via the toggle in the top nav, and the choice
 *                persists in localStorage
 *
 * The user's explicit toggle always wins regardless of the env var
 * — `enableSystem` only affects the FIRST-paint default. After they
 * pick a theme manually, `next-themes` persists it.
 *
 * `attribute="class"` toggles the `.dark` class on `<html>` so
 * Tailwind's `@custom-variant dark` matches.
 */

"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import * as React from "react";

type DefaultTheme = "light" | "dark" | "system";

function readDefaultTheme(): DefaultTheme {
  // Read at module-load via process.env so Next bakes it into the
  // client bundle. NEXT_PUBLIC_-prefixed vars are exposed to the
  // browser; other prefixes would not be visible here.
  const raw = process.env.NEXT_PUBLIC_DEFAULT_THEME?.toLowerCase().trim();
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  // Unrecognized / unset → dark (the dashboard's design default).
  return "dark";
}

const DEFAULT_THEME = readDefaultTheme();

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={DEFAULT_THEME}
      enableSystem={DEFAULT_THEME === "system"}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
