import { HistoryClient } from "@/components/history/HistoryClient";

/**
 * History tab. Server shell defers to <HistoryClient /> which owns
 * the range state and TanStack-driven data fetch.
 */
export default function HistoryPage() {
  return <HistoryClient />;
}
