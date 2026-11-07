import { motion, useReducedMotion } from 'framer-motion';

const EASE: [number, number, number, number] = [0.76, 0, 0.24, 1];

/**
 * One-shot page transition, keyed on the route so it replays.
 *   curtain — a plain panel sheet with the logo slides across and away:
 *             used when changing page.
 *   scan    — a thin line sweeps top → bottom:
 *             used when switching test on the execution page.
 */
export function ScanWipe({ variant = 'curtain' }: { variant?: 'curtain' | 'scan' }) {
  const reduce = useReducedMotion();
  if (reduce) return null;

  if (variant === 'scan') {
    return (
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[30vh]"
        initial={{ y: '-30vh', opacity: 1 }}
        animate={{ y: '100vh', opacity: [1, 1, 0] }}
        transition={{ duration: 0.65, ease: [0.65, 0, 0.35, 1], opacity: { times: [0, 0.8, 1], duration: 0.65 } }}
      >
        <div className="absolute inset-x-0 bottom-0 h-px bg-accent-grad" />
      </motion.div>
    );
  }

  const sweep = (delay: number) => ({
    initial: { clipPath: 'inset(0 100% 0 0)' },
    animate: { clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)', 'inset(0 0% 0 0)', 'inset(0 0% 0 100%)'] },
    transition: { duration: 0.95, delay, times: [0, 0.38, 0.55, 1], ease: EASE },
  });

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60]">
      <motion.div className="absolute inset-0 grid place-items-center border-x-4 border-plate bg-ink-900" {...sweep(0)}>
        <motion.img
          src="/logo.png"
          alt=""
          className="logo-ink relative w-32 max-w-[40vw]"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.8, delay: 0.1, times: [0, 0.35, 0.6, 1] }}
        />
      </motion.div>
    </div>
  );
}
