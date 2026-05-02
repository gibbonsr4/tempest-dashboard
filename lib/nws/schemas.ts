/**
 * Zod schemas for NWS active-alerts responses (`api.weather.gov/alerts/active`).
 *
 * The full GeoJSON schema is large; we only validate the fields the
 * dashboard actually renders. Geometry is parsed but kept loose (so a
 * future Radar tab can use it without a re-parse).
 */

import { z } from "zod";

const alertProperties = z.object({
  id: z.string().optional(),
  event: z.string(), // e.g. "Heat Advisory"
  headline: z.string().optional(),
  description: z.string().optional(),
  instruction: z.string().nullable().optional(),
  severity: z.string().optional(), // "Minor" | "Moderate" | "Severe" | "Extreme" | "Unknown"
  certainty: z.string().optional(),
  urgency: z.string().optional(),
  sender: z.string().optional(),
  senderName: z.string().optional(),
  effective: z.string().optional(), // ISO timestamps
  onset: z.string().nullable().optional(),
  expires: z.string().optional(),
  ends: z.string().nullable().optional(),
  status: z.string().optional(),
  messageType: z.string().optional(),
  category: z.string().optional(),
  areaDesc: z.string().optional(),
});

const alertFeature = z.object({
  id: z.string().optional(),
  type: z.literal("Feature").optional(),
  geometry: z.unknown().nullable().optional(),
  properties: alertProperties,
});

export const alertsFeatureCollection = z.object({
  type: z.literal("FeatureCollection").optional(),
  features: z.array(alertFeature),
  title: z.string().optional(),
  updated: z.string().optional(),
});

export type Alert = z.infer<typeof alertFeature>;
export type AlertsFeatureCollection = z.infer<typeof alertsFeatureCollection>;
