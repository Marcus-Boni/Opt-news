// A count that changes in place: the old figure leaves and the new one arrives from the direction of the change
// (up when it grows, down when it shrinks), so the reader sees what moved. MotionConfig keeps only the fade under
// reduced motion. The live region belongs to the caller.
import { AnimatePresence, motion } from "motion/react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

const roll = {
  enter: (dir: number) => ({ y: dir > 0 ? "70%" : "-70%", opacity: 0 }),
  center: { y: "0%", opacity: 1 },
  exit: (dir: number) => ({ y: dir > 0 ? "-70%" : "70%", opacity: 0 }),
};

export function RollingNumber({ value, className }: { value: number; className?: string }) {
  const last = useRef(value);
  const dir = Math.sign(value - last.current) || 1;
  last.current = value;
  return (
    <span className={cn("tabular relative inline-flex overflow-hidden align-bottom", className)}>
      <AnimatePresence initial={false} custom={dir} mode="popLayout">
        <motion.span
          key={value}
          custom={dir}
          variants={roll}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
