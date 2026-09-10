"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Motion-safe entrance wrapper (script 14, Task 11). Fades/rises children into
 * view on mount, staggered by `index`. Durations are ≤300ms and the animation is
 * fully disabled under `prefers-reduced-motion` (renders a plain element).
 */
export function Reveal({
  children,
  index = 0,
  className,
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut", delay: Math.min(index * 0.05, 0.4) }}
    >
      {children}
    </motion.div>
  );
}
