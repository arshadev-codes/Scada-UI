import type { Variants } from 'framer-motion';

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Parent container that staggers its children's entrance. */
export const stagger = (step = 0.07, delay = 0.1): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});

/**
 * Panel entrance: racks in like a withdrawable breaker sliding into its
 * cubicle — rises, then settles with a short spring. Opacity + transform only.
 */
export const powerUp: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.985 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      opacity: { duration: 0.35, ease: EASE_OUT },
      y: { type: 'spring', stiffness: 260, damping: 24, mass: 0.9 },
      scale: { type: 'spring', stiffness: 260, damping: 24, mass: 0.9 },
    },
  },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
};
