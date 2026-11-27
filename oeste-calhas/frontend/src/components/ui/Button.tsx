"use client";
import type { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "motion/react";

export type Variant = "primary" | "green" | "ghost" | "soft" | "danger" | "dangerSolid" | "google";
type Props = Omit<HTMLMotionProps<"button">, "children"> & { children?: ReactNode; variant?: Variant; size?: "md" | "sm" | "icon"; loading?: boolean; full?: boolean };

export default function Button({ variant = "primary", size = "md", loading, full, className = "", children, disabled, type = "button", ...rest }: Props) {
  return (
    <motion.button
      type={type}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      className={`btn v-${variant} s-${size}${full ? " full" : ""} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spin" aria-hidden="true" /> : null}
      {loading && size === "icon" ? <span className="sr">Carregando</span> : children}
    </motion.button>
  );
}
