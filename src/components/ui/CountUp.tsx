import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import { cn } from '@/lib/format';

interface CountUpProps {
  value: number | null;
  decimals?: number;
  duration?: number;
  /** Shown when value is null */
  placeholder?: string;
  className?: string;
}

/** Monospace numeric readout that counts toward each new value. */
export function CountUp({ value, decimals = 0, duration = 0.8, placeholder = '--', className }: CountUpProps) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value ?? 0);
  const text = useTransform(mv, (v) =>
    v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  );

  useEffect(() => {
    if (value === null) return;
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [value, duration, reduce, mv]);

  if (value === null) return <span className={cn('num text-fg-dim', className)}>{placeholder}</span>;
  return <motion.span className={cn('num', className)}>{text}</motion.span>;
}
