"use client";
import { AnimatePresence, motion } from "motion/react";

export default function Field({ label, hint, error, children }: { label: React.ReactNode; hint?: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <label className={`field${error ? " invalid" : ""}`}>
      <span className="field-l">{label}{hint ? <small>{hint}</small> : null}</span>
      {children}
      <AnimatePresence initial={false}>
        {error ? <motion.span key="e" role="alert" className="f-err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{error}</motion.span> : null}
      </AnimatePresence>
    </label>
  );
}
