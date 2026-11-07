/**
 * Wiring helpers shared by the instrument-test drawings (IR, Voltage Ratio):
 * square cable routes with rounded corners, and moving pulses that show
 * current or voltage travelling along a conductor.
 */
import { motion } from 'framer-motion';
import type { Pt } from './TransformerParts';

/** Square route with rounded corners, like a cable laid along a wiring mimic. */
export function rounded(pts: Pt[], r = 12): string {
  const f = (n: number) => +n.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let k = 1; k < pts.length - 1; k++) {
    const [px, py] = pts[k - 1];
    const [cx, cy] = pts[k];
    const [nx, ny] = pts[k + 1];
    const l1 = Math.hypot(cx - px, cy - py) || 1;
    const l2 = Math.hypot(nx - cx, ny - cy) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    d += ` L${f(cx - ((cx - px) / l1) * rr)} ${f(cy - ((cy - py) / l1) * rr)} Q${f(cx)} ${f(cy)} ${f(cx + ((nx - cx) / l2) * rr)} ${f(cy + ((ny - cy) / l2) * rr)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${f(last[0])} ${f(last[1])}`;
}

/** Short pulses travelling along a conductor. `fwd` follows the path's own direction. */
export function Flow({ d, fwd, color, size = 3.6, gap = 30, speed = 0.55, delay = 0 }: { d: string; fwd: boolean; color: string; size?: number; gap?: number; speed?: number; delay?: number }) {
  const len = 6;
  const period = len + gap;
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={size}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={`${len} ${gap}`}
      initial={{ opacity: 0, strokeDashoffset: 0 }}
      animate={{ opacity: 1, strokeDashoffset: fwd ? -period : period }}
      transition={{ opacity: { delay, duration: 0.4 }, strokeDashoffset: { duration: speed, repeat: Infinity, ease: 'linear' } }}
    />
  );
}
