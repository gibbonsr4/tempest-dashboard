"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A bento card that flips between a one-line summary (collapsed) and a
 * detailed view (expanded).
 *
 * Controlled vs uncontrolled:
 *   - Pass nothing: the card owns its own open state, starting closed.
 *   - Pass `open` + `onOpenChange`: the parent owns state. The card
 *     reflects `open` as-is and reports user toggles through
 *     `onOpenChange`.
 *   This mirrors the controlled/uncontrolled split Radix and shadcn
 *   primitives use, so coupling two cards together (e.g., the rain +
 *   lightning storm panel) just means lifting the state up.
 */
export function AdaptiveCard({
  collapsed,
  expanded,
  open: openProp,
  onOpenChange,
  ariaLabel,
  className,
}: {
  collapsed: React.ReactNode;
  expanded: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  ariaLabel: string;
  className?: string;
}) {
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const reduce = useReducedMotion();

  const open = isControlled ? openProp : internalOpen;

  const handleToggle = () => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <motion.section
      layout={!reduce}
      transition={
        reduce
          ? { duration: 0 }
          : { type: "spring", stiffness: 280, damping: 32 }
      }
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow-sm",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={handleToggle}
        className={cn(
          "flex w-full items-center justify-between gap-4 px-4 py-3 text-left",
          "rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <div className="min-w-0 flex-1">{collapsed}</div>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="expanded"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : { type: "spring", stiffness: 280, damping: 32 }
            }
            // Clip ONLY the bottom edge, via a static clip-path rather
            // than `overflow: hidden`. The bottom clip is what the
            // height animation needs — it stops content from spilling
            // past the box as it expands/collapses. Leaving the top
            // open lets the storm histogram's hover tooltip (drawn
            // above the bars at the top of this region) escape upward
            // and paint over the card header instead of being cropped.
            //
            // Why not toggle `overflow` on animation end: that leaves
            // the tooltip clipped until the spring *completes*, and the
            // Now tab's 1-second clock re-render can interrupt the
            // spring mid-flight (observed on mobile) so it never fires.
            // A static clip-path has no such dependency — it can't get
            // stuck. The negative insets give the tooltip generous
            // headroom on every side except the bottom.
            style={{ clipPath: "inset(-1000px -1000px 0px -1000px)" }}
          >
            <div className="border-t px-4 py-3">{expanded}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
