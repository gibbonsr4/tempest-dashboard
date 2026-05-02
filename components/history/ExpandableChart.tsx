"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Wraps a chart card with a click-to-expand affordance. Click anywhere
 * on the card (or focus + Enter/Space) opens a centered dialog with
 * the same chart at a much larger size — useful at long ranges (e.g.
 * 365-day rain) where each daily bar collapses to a couple of pixels
 * and tooltips are hard to target.
 *
 * Pattern: the same `children` element is rendered twice — once inline
 * at its small native size, once inside the dialog with `chartHeight`
 * cloned in via `React.cloneElement`. That keeps call sites clean
 * (chart props written once) and avoids any data-flow duplication.
 *
 * Accessibility comes from Base UI's `DialogTrigger`: passing the
 * trigger element via `render` makes Base UI apply the proper
 * `aria-haspopup`, `aria-expanded`, and `aria-controls` attributes,
 * plus the click + keyboard (Enter/Space) handlers — so the
 * trigger↔popup linkage is real, not faked with a `role="button"`
 * div. We use a `<div>` as the rendered element (rather than the
 * default `<button>`) because charts can contain interactive
 * tooltip regions and nesting interactive elements inside a
 * `<button>` is invalid HTML.
 *
 * The dialog itself only mounts when open (Base UI's portal does
 * lazy mounting), so the second chart instance has no cost while
 * the user is just scrolling the grid.
 */
export function ExpandableChart({
  title,
  children,
}: {
  /** Optional override for the dialog header. Defaults to the
   *  wrapped chart's `label` prop, so callers don't have to pass
   *  the same string twice. */
  title?: string;
  /** A single chart React element. The contract: must expose a
   *  required `label: string` prop (used for the dialog title), and
   *  accept optional `chartHeight?: string` and `hideLabel?: boolean`
   *  props that the wrapper injects on the dialog instance — the
   *  former resizes the plot area, the latter prevents duplicating
   *  the metric name inside the dialog. Both `DailyAggregateChart`
   *  and `MetricChart` satisfy this. */
  children: React.ReactElement<{
    label: string;
    chartHeight?: string;
    hideLabel?: boolean;
  }>;
}) {
  const dialogTitle = title ?? children.props.label;

  return (
    <Dialog>
      {/* Base UI's render prop turns this <div> into the trigger
          element while keeping it a div (so chart tooltips inside
          can stay interactive without invalid nested-button HTML).
          Cursor + focus ring give visual affordance; ARIA wiring
          comes from the primitive. */}
      <DialogTrigger
        render={
          <div
            className="cursor-pointer rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-foreground/40"
            aria-label={`Expand ${dialogTitle} chart`}
          />
        }
      >
        {children}
      </DialogTrigger>

      {/* The default `DialogContent` ships with `sm:max-w-sm`
          baked in (~384px); `sm:max-w-6xl` overrides that on
          desktop. `max-h-[90vh] overflow-auto` prevents the tall
          chart from spilling off short viewports. */}
      <DialogContent className="w-[95vw] max-h-[90vh] max-w-6xl gap-3 overflow-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        {React.cloneElement(children, {
          chartHeight: "h-[60vh]",
          hideLabel: true,
        })}
      </DialogContent>
    </Dialog>
  );
}
