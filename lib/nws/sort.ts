/**
 * NWS alert ordering. NWS doesn't guarantee feature order, so the
 * AlertsBanner banner pre-sorts before picking the headline. Without
 * this, a multi-alert day can spotlight a Minor advisory while burying
 * an Extreme warning lower in the expanded list.
 *
 * Ranking (most urgent first):
 *
 *   1. Severity   — Extreme > Severe > Moderate > Minor > Unknown
 *   2. Urgency    — Immediate > Expected > Future > Past > Unknown
 *   3. Expiration — sooner-expiring first (more time-pressured)
 */

import type { Alert } from "./schemas";

const SEVERITY_RANK: Record<string, number> = {
  extreme: 4,
  severe: 3,
  moderate: 2,
  minor: 1,
};

const URGENCY_RANK: Record<string, number> = {
  immediate: 4,
  expected: 3,
  future: 2,
  past: 1,
};

function severityScore(a: Alert): number {
  return SEVERITY_RANK[(a.properties.severity ?? "").toLowerCase()] ?? 0;
}

function urgencyScore(a: Alert): number {
  return URGENCY_RANK[(a.properties.urgency ?? "").toLowerCase()] ?? 0;
}

function expirationMs(a: Alert): number {
  // Missing expiration sorts last; parse-failure also sorts last.
  const raw = a.properties.expires;
  if (!raw) return Number.POSITIVE_INFINITY;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/**
 * Returns a new array sorted most-urgent-first. Pure: input is not
 * mutated.
 */
export function sortAlertsBySeverity(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    const sev = severityScore(b) - severityScore(a);
    if (sev !== 0) return sev;
    const urg = urgencyScore(b) - urgencyScore(a);
    if (urg !== 0) return urg;
    return expirationMs(a) - expirationMs(b);
  });
}
