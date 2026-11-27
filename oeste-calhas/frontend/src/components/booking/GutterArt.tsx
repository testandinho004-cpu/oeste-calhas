"use client";
import { motion, useReducedMotion } from "motion/react";

/** Calha com gotas caindo: o único movimento "decorativo" da página. */
export default function GutterArt() {
  const reduce = useReducedMotion();
  const drops = [{ x: 90, c: "var(--orange)", d: 0 }, { x: 210, c: "var(--gold)", d: 0.9 }, { x: 320, c: "var(--peach)", d: 1.7 }];
  return (
    <svg className="gutter-art" viewBox="0 0 420 150" aria-hidden="true">
      <rect x="6" y="14" width="408" height="14" rx="7" fill="var(--green)" />
      <path d="M6 24h408v6a14 14 0 01-14 14H20A14 14 0 016 30z" fill="var(--green-2)" />
      <path d="M20 132h380" stroke="var(--line-2)" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 10" />
      {drops.map((d) => (
        <motion.path
          key={d.x} d={`M${d.x} 50c5 8 8 12 8 17a8 8 0 01-16 0c0-5 3-9 8-17z`} fill={d.c}
          initial={{ y: 0, opacity: 0 }}
          animate={reduce ? { opacity: 1, y: 40 } : { y: [0, 74], opacity: [0, 1, 1, 0] }}
          transition={reduce ? undefined : { duration: 2.4, delay: d.d, repeat: Infinity, ease: "easeIn", times: [0, 0.15, 0.85, 1] }}
        />
      ))}
    </svg>
  );
}
