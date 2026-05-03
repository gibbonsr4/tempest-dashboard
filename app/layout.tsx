import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/query-client";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopNav } from "@/components/nav/TopNav";
import { AppShell } from "@/components/shared/AppShell";

/**
 * Inter is a tighter, more polished default than the scaffolded Geist
 * Sans for dashboard-style typography. We keep Geist Mono available
 * via the `--font-geist-mono` CSS variable for any monospace bits.
 */
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tempest · Personal Weather Dashboard",
  description: "Live conditions, forecast, and history for a personal Tempest weather station.",
};

/**
 * Browser chrome / status bar coloring strategy (rewritten 2026-05).
 *
 * Three platform paths to consider, none of which want a JS-driven
 * theme-color updater:
 *
 *   1. **iOS 26+ Safari**: WebKit no longer honors `<meta name=
 *      "theme-color">` mutations. Instead it live-observes the CSS
 *      `background-color` of fixed/sticky elements near viewport
 *      edges (falling back to `<body>`). The TopNav is a solid
 *      `bg-background` sticky top, so the chrome tracks our theme
 *      automatically when next-themes flips the `.dark` class.
 *
 *   2. **iOS 15–25 / Android**: still honors `<meta name=
 *      "theme-color">`, including the `media` attribute. Two media-
 *      query variants below pick the right hex based on the OS color
 *      scheme. Caveat: on these platforms the chrome follows the OS,
 *      not our in-app toggle if the two diverge — that's the
 *      documented limitation, and the page background still tracks
 *      the toggle correctly via CSS so the discrepancy is brief and
 *      bounded.
 *
 *   3. **Installed PWA on iOS**: `apple-mobile-web-app-status-bar-
 *      style="black-translucent"` makes the status bar transparent,
 *      with web content extending behind it. Combined with
 *      `viewportFit: "cover"` and `padding-top:
 *      env(safe-area-inset-top)` on the TopNav, the visible "status
 *      bar color" is just the TopNav's `bg-background` — so it
 *      tracks the in-app toggle automatically.
 */
export const viewport: Viewport = {
  themeColor: [
    // Light: oklch(0.99 0.005 80). Dark: oklch(0.18 0.018 250).
    // sRGB approximations for the meta tag (browsers don't yet
    // accept OKLCH in `theme-color`).
    { media: "(prefers-color-scheme: light)", color: "#fefbf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1219" },
  ],
  // Lets `env(safe-area-inset-*)` resolve to non-zero values, which
  // the TopNav uses to pad below the status bar in installed PWA.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Installed-PWA status bar style. The three Apple-supported
            values are `default`, `black`, and `black-translucent`;
            the latter is the only one that lets the page itself
            paint the visible color behind the status bar, so we
            pick that and let `bg-background` (via TopNav) handle
            the actual theming. */}
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />

        {/* Resource hints for the Radar tab's Ventusky iframe.
            `dns-prefetch` resolves the hostname; `preconnect` also
            establishes the TCP + TLS connection so the click→load
            handshake is already done by the time the user navigates
            to /radar. Saves ~200-500ms on first Radar visit per
            session. The hints are scoped to a single third-party
            origin so the privacy delta is small (Ventusky's server
            sees a connection but no payload) and the bandwidth cost
            is one TCP handshake per page load. We deliberately stop
            short of pre-fetching the iframe HTML or pre-mounting the
            iframe in this layout — those are heavier interventions
            that send full requests + tile loads to Ventusky on every
            page even when the user never visits Radar. */}
        <link rel="dns-prefetch" href="https://embed.ventusky.com" />
        <link rel="preconnect" href="https://embed.ventusky.com" crossOrigin="anonymous" />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider>
          <QueryProvider>
            <AppShell>
              <TooltipProvider delay={250}>
                <TopNav />
                <main className="flex-1">{children}</main>
              </TooltipProvider>
            </AppShell>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
