"use client";
import { useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

/** Desktop: hover/foco. Celular: toque mostra por ~2s. */
export default function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  return (
    <span
      className="tt"
      onPointerEnter={(e) => { if (e.pointerType === "mouse") show(); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") hide(); }}
      onPointerDown={(e) => { if (e.pointerType === "touch") { show(); timer.current = setTimeout(hide, 2000); } }}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(e) => { if (e.key === "Escape") hide(); }}
      aria-describedby={open ? id : undefined}
    >
      {children}
      <AnimatePresence>
        {open ? (
          <motion.span id={id} role="tooltip" className={`tt-pop ${side}`} initial={{ opacity: 0, y: side === "top" ? 4 : -4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.14 }}>
            {content}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
