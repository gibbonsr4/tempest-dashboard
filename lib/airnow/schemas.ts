/**
 * Zod schema for AirNow's current-observation endpoint.
 *
 * AirNow returns an array of monitor readings — one per pollutant
 * (e.g. one entry for `O3`, one for `PM2.5`). When no monitor exists
 * within the configured radius the array is empty (the route handler
 * surfaces that as a "no nearby monitor" UI state).
 */

import { z } from "zod";

export const airnowObservation = z.object({
  DateObserved: z.string().optional(),
  HourObserved: z.number().optional(),
  LocalTimeZone: z.string().optional(),
  ReportingArea: z.string().optional(),
  StateCode: z.string().optional(),
  Latitude: z.number().optional(),
  Longitude: z.number().optional(),
  ParameterName: z.string(), // "O3" | "PM2.5" | "PM10" | "NO2" | "CO" | "SO2"
  AQI: z.number().nullable(),
  Category: z
    .object({
      Number: z.number(),
      Name: z.string(),
    })
    .optional(),
});

export const airnowResponse = z.array(airnowObservation);

export type AirnowResponse = z.infer<typeof airnowResponse>;
