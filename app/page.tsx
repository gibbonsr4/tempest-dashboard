import { NowClient } from "@/components/now/NowClient";

/**
 * The Now tab. Server-rendered shell defers data and live state to
 * <NowClient>, which owns the WS lifecycle and TanStack Query hooks.
 */
export default function NowPage() {
  return <NowClient />;
}
