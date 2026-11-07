import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/format';

/** PASS / FAIL slammed on like a rubber inspection stamp, with a small shock ring. */
export function ResultStamp({ pass, small }: { pass: boolean; small?: boolean }) {
  const reduce = useReducedMotion();
  const tone = pass ? 'text-ok border-ok' : 'text-fault border-fault';
  return (
    <div className="relative inline-grid place-items-center py-1">
      {!reduce && (
        <motion.span
          aria-hidden
          className={cn('absolute inset-0 rounded-[4px] border-2', tone)}
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
          transition={{ duration: 0.5, delay: 0.22 }}
        />
      )}
      <motion.div
        className={cn('rounded-[4px] border-[3px] border-double font-display font-bold tracking-[0.12em]', small ? 'px-2.5 text-lg' : 'px-4 py-1 text-3xl', tone)}
        initial={reduce ? false : { scale: 2.4, rotate: -16, opacity: 0 }}
        animate={{ scale: 1, rotate: -5, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 22, mass: 0.9 }}
      >
        {pass ? 'PASS' : 'FAIL'}
      </motion.div>
    </div>
  );
}
