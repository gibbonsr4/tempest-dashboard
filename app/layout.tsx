import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/lib/query-client";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemeColorMeta } from "@/components/theme/ThemeColorMeta";
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

const themeColorScript = `!function(){try{var e=localStorage.getItem("theme"),t="${process.env.NEXT_PUBLIC_DEFAULT_THEME ?? ""}".toLowerCase().trim(),m=document.querySelector('meta[name="theme-color"]');if(!m)(m=document.createElement("meta")).name="theme-color",document.head.appendChild(m);("light"===e||"dark"===e)||(e="light"===t||"dark"===t?t:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"),m.content="light"===e?"#fefbf8":"#0b1219"}catch(e){}}();`;

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
        <script dangerouslySetInnerHTML={{ __html: themeColorScript }} />

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
          <ThemeColorMeta />
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
