import { RadarClient } from "@/components/radar/RadarClient";

/**
 * Radar tab — Ventusky iframe embed centered on the user's Tempest
 * station. The full radar implementation lives in
 * `components/radar/RadarClient.tsx`; this route just hosts it.
 */
export default function RadarPage() {
  return <RadarClient />;
}
