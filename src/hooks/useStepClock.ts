import { useEffect } from 'react';
import { useMotionValue, type MotionValue } from 'framer-motion';
import { usePlcStore } from '@/store/plcStore';

export interface StepClock {
  /** ms remaining in the active timed step */
  remainingMs: MotionValue<number>;
  /** 0 → 1 progress through the active step */
  progress: MotionValue<number>;
}

/**
 * Smoothly interpolates the PLC step timer between 200 ms status frames.
 * Runs on rAF and writes to motion values, so the countdown animates at
 * display rate without re-rendering React.
 */
export function useStepClock(): StepClock {
  const remainingMs = useMotionValue(0);
  const progress = useMotionValue(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const { status, receivedAt } = usePlcStore.getState();
      if (status && status.running && status.stepPresetMs > 0) {
        const elapsed = Math.min(
          status.stepPresetMs,
          status.stepElapsedMs + (performance.now() - receivedAt),
        );
        remainingMs.set(status.stepPresetMs - elapsed);
        progress.set(elapsed / status.stepPresetMs);
      } else {
        remainingMs.set(0);
        progress.set(status?.step === 'COMPLETE' ? 1 : 0);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [remainingMs, progress]);

  return { remainingMs, progress };
}
