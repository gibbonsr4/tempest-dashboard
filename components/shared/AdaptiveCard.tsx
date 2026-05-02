"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A bento card that flips between a one-line summary (collapsed) and a
 * detailed view (expanded). Used for rain and lightning, both of which
 * have a quiet steady state and a "promote me" active state.
 *
 * The "promoted" prop signals importance — an actively-firing module
 * gets a copper ring + subtle scale to catch the eye without being
 * gaudy.
 *
 * Controlled vs uncontrolled:
 *   - Pass nothing: the card owns its own open state, seeded from
 *     `defaultExpanded` and force-opened when `promoted` flips on.
 *   - Pass `open` + `onOpenChange`: the parent owns state. The card
 *     reflects `open` as-is and reports user toggles through
 *     `onOpenChange`. `defaultExpanded` and the auto-expand-on-
 *     `promoted` heuristic are skipped — the parent is responsible for
 *     deciding when to auto-open. (`promoted` still drives the visual
 *     ring either way.)
 *   This mirrors the controlled/uncontrolled split Radix and shadcn
 *   primitives use, so coupling two cards together (e.g., the rain +
 *   lightning storm panel) just means lifting the state up.
 */
export function AdaptiveCard({
  collapsed,
  expanded,
  promoted = false,
  defaultExpanded = false,
  open: openProp,
  onOpenChange,
  ariaLabel,
  className,
}: {
  collapsed: React.ReactNode;
  expanded: React.ReactNode;
  promoted?: boolean;
  defaultExpanded?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  ariaLabel: string;
  className?: string;
}) {
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(defaultExpanded);
  const [prevPromoted, setPrevPromoted] = React.useState(promoted);
  const reduce = useReducedMotion();

  const open = isControlled ? openProp : internalOpen;

  // "Adjusting state on prop change" pattern (per the React docs):
  // when `promoted` flips on, force-expand. We never auto-collapse
  // when promotion ends — the user may have intentionally expanded.
  // In controlled mode, the parent owns this decision; we just
  // record the new `prevPromoted` so a future flip is detected.
  if (prevPromoted !== promoted) {
    setPrevPromoted(promoted);
    if (promoted && !isControlled) setInternalOpen(true);
  }

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
        promoted && "border-primary/50 ring-1 ring-primary/30",
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
            className="overflow-hidden"
          >
            <div className="border-t px-4 py-3">{expanded}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
