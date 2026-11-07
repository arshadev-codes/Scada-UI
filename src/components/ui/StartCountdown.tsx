import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * Full-screen 3 · 2 · 1 after START is pressed, so everyone at the bay sees
 * the bench is about to be energised. Cancel (button or Esc) aborts; at zero
 * `onDone` fires and the test starts.
 */
export function StartCountdown({
  open,
  title,
  seconds = 3,
  onDone,
  onCancel,
}: {
  open: boolean;
  title: string;
  /** Length of the countdown */
  seconds?: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [n, setN] = useState(seconds);
  const cb = useRef({ onDone, onCancel });
  cb.current = { onDone, onCancel };

  useEffect(() => {
    if (!open) return;
    setN(seconds);
    const id = setInterval(() => setN((x) => x - 1), 1000);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && cb.current.onCancel();
    window.addEventListener('keydown', esc);
    return () => {
      clearInterval(id);
      window.removeEventListener('keydown', esc);
    };
  }, [open, seconds]);

  useEffect(() => {
    if (open && n === 0) cb.current.onDone();
  }, [open, n]);

  return (
    <AnimatePresence>
      {open && n > 0 && (
        <motion.div
          role="alertdialog"
          aria-label={`${title} starts in ${n}`}
          className="fixed inset-0 z-[80] grid place-items-center bg-ink-950/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
        >
          <div className="flex flex-col items-center gap-6">
            <div className="text-[15px] font-semibold uppercase tracking-[0.2em] text-amber">Energising in</div>
            <div className="relative grid size-64 place-items-center">
              {/* ring that drains each second */}
              <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                <circle cx="50" cy="50" r="46" fill="none" stroke="var(--color-line)" strokeWidth="3" />
                <motion.circle
                  key={n}
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke="var(--color-amber)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="1"
                  initial={{ strokeDashoffset: 0 }}
                  animate={{ strokeDashoffset: 1 }}
                  transition={{ duration: 1, ease: 'linear' }}
                />
              </svg>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={n}
                  className="font-display text-[150px] font-bold leading-none text-fg tabular-nums"
                  initial={{ scale: 1.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                >
                  {n}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="text-[18px] font-semibold text-fg">{title}</div>
            <button
              type="button"
              autoFocus
              onClick={onCancel}
              className="rounded-[6px] border border-line-strong px-6 py-2.5 text-[15px] font-semibold text-fg transition-colors hover:border-fault hover:text-fault"
            >
              Cancel (Esc)
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
