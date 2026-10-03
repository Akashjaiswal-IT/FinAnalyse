"use client";

import { motion } from "motion/react";

/** Each page fades in on navigation; the template re-mounts per route, the layout and top bar do not. */
export default function ShellTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div className="h-full" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}
