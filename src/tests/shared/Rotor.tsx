import { useMotionValueEvent, useReducedMotion, useSpring } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * SVG group that turns to `angle` (degrees, clockwise) about (cx, cy) on a
 * spring, like a meter needle. Written straight to the transform attribute,
 * as VariacGauge does, so the pivot is exact and nothing re-renders per frame.
 */
export function Rotor({
  angle,
  cx,
  cy,
  stiffness = 60,
  damping = 13,
  from,
  children,
}: {
  angle: number;
  /** Start here and swing to `angle` on mount (default: start at `angle`) */
  from?: number;
  cx: number;
  cy: number;
  stiffness?: number;
  damping?: number;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const spring = useSpring(from ?? angle, reduce ? { stiffness: 1000, damping: 100 } : { stiffness, damping });
  const ref = useRef<SVGGElement>(null);
  // React only ever writes the first angle; after that the spring owns the attribute.
  const first = useRef(from ?? angle);
  useEffect(() => {
    spring.set(angle);
  }, [angle, spring]);
  useMotionValueEvent(spring, 'change', (a) => ref.current?.setAttribute('transform', `rotate(${a} ${cx} ${cy})`));
  return (
    <g ref={ref} transform={`rotate(${first.current} ${cx} ${cy})`}>
      {children}
    </g>
  );
}
