"use client";
import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";

export default function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => Math.round(v).toString());
  useEffect(() => {
    if (reduce) { mv.set(value); return; }
    const c = animate(mv, value, { duration: 0.8, ease: "easeOut" });
    return () => c.stop();
  }, [value, mv, reduce]);
  return <motion.span>{text}</motion.span>;
}
