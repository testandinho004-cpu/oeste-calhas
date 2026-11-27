"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { IconX } from "./Icons";

type Props = { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg"; dismissible?: boolean };
const stack: symbol[] = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Desktop: diálogo centralizado. Celular: bottom sheet. Fecha com Esc, clique fora ou no X. */
export default function Modal({ open, onClose, title, children, footer, size = "md", dismissible = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const tid = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const me = useRef(Symbol("modal"));

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const old = html.style.overflow;
    html.style.overflow = "hidden";
    const id = me.current;
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === "Escape" && dismissible) { e.stopPropagation(); closeRef.current(); }
      if (e.key !== "Tab" || !ref.current) return;
      const els = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => { (ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current)?.focus(); }, 60);
    return () => { const i = stack.indexOf(id); if (i >= 0) stack.splice(i, 1); clearTimeout(t); document.removeEventListener("keydown", onKey); html.style.overflow = old; prev?.focus?.(); };
  }, [open, dismissible]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="modal-root" key="modal">
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={dismissible ? onClose : undefined} />
          <motion.div
            ref={ref} role="dialog" aria-modal="true" aria-labelledby={tid} tabIndex={-1}
            className={`modal ${size}`}
            initial={{ opacity: 0, y: 36, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 28, scale: 0.98 }}
            transition={{ type: "spring", damping: 30, stiffness: 340 }}
          >
            <div className="grab" aria-hidden="true" />
            <div className="modal-head">
              <h2 id={tid}>{title}</h2>
              {dismissible ? <button type="button" className="btn v-ghost s-icon" onClick={onClose} aria-label="Fechar"><IconX /></button> : null}
            </div>
            <div className="modal-body">{children}</div>
            {footer ? <div className="modal-foot">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
