/**
 * Tooltip — hover tooltip using @floating-ui/react.
 */

import { useState, type ReactNode } from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  type Placement,
} from "@floating-ui/react";
import "./Tooltip.css";

export interface TooltipProps {
  /** The content shown in the tooltip. */
  content: ReactNode;
  /** Placement relative to the trigger element. */
  placement?: Placement;
  /** The trigger element. */
  children: ReactNode;
  /** Delay before showing (ms). */
  delay?: number;
}

export function Tooltip({
  content,
  placement = "top",
  children,
  delay = 200,
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  });

  const hover = useHover(context, { delay: { open: delay, close: 0 } });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  return (
    <>
      <span ref={refs.setReference} {...getReferenceProps()} className="tooltip-trigger">
        {children}
      </span>
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="tooltip-content"
          >
            {content}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
