import type { MetadataRoute } from "next";

/**
 * Web App Manifest — makes the dashboard installable as a PWA. Phones
 * that visit the deployed URL get an "Add to Home Screen" prompt
 * (Chrome/Android automatically; iOS Safari via Share menu). Once
 * installed, the dashboard opens in its own standalone window with no
 * browser chrome.
 *
 * Theme color matches the dark-theme `--primary` copper accent
 * (`oklch(0.72 0.12 55)` ≈ `#cf7f4e`), so the status bar / window
 * chrome on the installed app uses the same accent as the dashboard
 * itself. Background color matches the dark-theme background so the
 * launch splash doesn't flash white before first render.
 *
 * Icon strategy: one SVG (`public/icon.svg`) with `sizes: "any"` —
 * Android/Chrome scale the SVG to whatever size they need (192×192
 * at install, larger when the icon is used in app switcher etc.).
 * Skipping pre-rendered PNGs keeps the public release artifact-free
 * — anyone forking the repo can drop in custom icons by editing this
 * file and adding their own files in `public/`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tempest Dashboard",
    short_name: "Tempest",
    description:
      "Personal weather dashboard for a WeatherFlow Tempest station — live conditions, forecast, lightning, AQI, and severe-weather alerts.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1216",
    theme_color: "#cf7f4e",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
