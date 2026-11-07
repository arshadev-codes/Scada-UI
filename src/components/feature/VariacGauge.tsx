import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from 'framer-motion';
import { useEffect, useId, useMemo, useRef } from 'react';
import { cn } from '@/lib/format';
import { RollingNumber } from '@/components/ui/RollingNumber';

interface VariacGaugeProps {
  /** Live variac output read back, V */
  value: number;
  /** Variac setpoint read back, V */
  setpoint: number;
  /** Source connected (Y0 on) */
  live: boolean;
  /** Unit after the number and on the scale end, default V */
  unit?: string;
  /** Caption under the number, default "Variac output" */
  label?: string;
  /** Full scale; default is a round number above 1.2 × setpoint */
  max?: number;
  decimals?: number;
  /** Arc colour, default violet → amber */
  color?: string;
  /** Smaller dial without the Set / % Set / State row */
  compact?: boolean;
  /** Draw an amber band from this value up to the setpoint, with a tick and label (e.g. rated → test voltage) */
  bandFrom?: number;
  bandLabel?: string;
}

const W = 320;
const CX = 160;
const CY = 172;
const R = 128;

/** Round up to a "nice" full-scale value (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ) */
export function niceMax(v: number, floor = 10): number {
  const target = Math.max(floor, v);
  const exp = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * exp >= target - 1e-9) return m * exp;
  return 10 * exp;
}

const compact = (v: number, max: number) =>
  v >= 1000 ? `${+(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : max < 10 ? String(+v.toFixed(2)) : String(Math.round(v));

/** Point on the dial. frac 0 = left end, 1 = right end. */
function polar(frac: number, r: number): [number, number] {
  const a = Math.PI - Math.PI * frac;
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}

function arcPath(from: number, to: number, r: number): string {
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(to, r);
  return `M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`;
}

/**
 * Half-circle "speedometer" for the variac output voltage. The needle and
 * progress arc ride a spring (slight overshoot like a real meter) and are
 * written straight to the DOM — no React re-render per frame.
 */
export function VariacGauge({
  value,
  setpoint,
  live,
  unit = 'V',
  label = 'Variac output',
  max: fullScale,
  decimals,
  color,
  compact: small = false,
  bandFrom,
  bandLabel,
}: VariacGaugeProps) {
  const uid = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  const max = useMemo(() => fullScale ?? niceMax(setpoint > 0 ? setpoint * 1.2 : 500), [fullScale, setpoint]);

  const spring = useSpring(0, reduce ? { stiffness: 1000, damping: 100 } : { stiffness: 90, damping: 19, mass: 0.9 });
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  const frac = useTransform(spring, (v) => Math.max(0, Math.min(1, v / max)));
  const velocity = useVelocity(spring);
  const glow = useTransform(velocity, (vel) => Math.min(1, 0.35 + Math.abs(vel) / (max * 0.6)));

  const needle = useRef<SVGGElement>(null);
  useMotionValueEvent(frac, 'change', (f) => {
    needle.current?.setAttribute('transform', `rotate(${-90 + 180 * f} ${CX} ${CY})`);
  });

  const setFrac = setpoint > 0 ? Math.min(1, setpoint / max) : null;
  const redFrom = setpoint > 0 ? Math.min(1, (setpoint * 1.1) / max) : 1;
  const pctOfSet = setpoint > 0 ? (value / setpoint) * 100 : 0;
  const state = !live ? (value > 0.5 ? 'RUN-DOWN' : 'DE-ENERGISED') : Math.abs(pctOfSet - 100) <= 2 ? 'STABLE' : 'RAMPING';

  return (
    <div className="flex w-full flex-col items-center">
      <svg
        viewBox={`0 0 ${W} 196`}
        className={cn('w-full', small ? 'max-w-[220px]' : 'max-w-[340px]')}
        role="img"
        aria-label={`${label} ${value.toFixed(2)} ${unit} of ${max} full scale`}
      >
        <defs>
          <linearGradient id={`${uid}-arc`} gradientUnits="userSpaceOnUse" x1={CX - R} y1="0" x2={CX + R} y2="0">
            <stop offset="0" stopColor={color ?? 'var(--viz-violet)'} />
            <stop offset="0.75" stopColor={color ?? 'var(--viz-violet)'} />
            <stop offset="1" stopColor={color ?? 'var(--viz-amber)'} />
          </linearGradient>
          <radialGradient id={`${uid}-bg`} cx="0.5" cy="1" r="0.75">
            <stop offset="0" stopColor={live ? 'var(--viz-amber)' : 'var(--viz-violet)'} stopOpacity="0" />
            <stop offset="1" stopColor="var(--viz-violet)" stopOpacity="0" />
          </radialGradient>
          <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="0" />
          </filter>
          <filter id={`${uid}-soft`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="0" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* backdrop glow scales with reading */}
        <motion.path d={`${arcPath(0, 1, R + 8)} Z`} fill={`url(#${uid}-bg)`} style={{ opacity: frac }} />

        {/* track */}
        <path d={arcPath(0, 1, R)} fill="none" stroke="var(--viz-track)" strokeWidth="16" strokeLinecap="round" />
        <path d={arcPath(0, 1, R - 26)} fill="none" stroke="var(--color-line-strong)" strokeWidth="1" strokeDasharray="2 5" />

        {/* redline band */}
        {redFrom < 1 && <path d={arcPath(redFrom, 1, R + 13)} fill="none" stroke="var(--color-fault)" strokeWidth="3" strokeOpacity="0.85" />}

        {/* optional band, e.g. the overvoltage zone from rated to test voltage */}
        {bandFrom !== undefined && bandFrom < max && (
          <g>
            <path d={arcPath(bandFrom / max, Math.min(1, (setpoint > 0 ? setpoint : max) / max), R + 13)} fill="none" stroke="var(--viz-amber)" strokeWidth="3" />
            {(() => {
              const [x1, y1] = polar(bandFrom / max, R + 6);
              const [x2, y2] = polar(bandFrom / max, R + 20);
              const [tx, ty] = polar(bandFrom / max, R + 30);
              return (
                <>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--viz-tick-major)" strokeWidth="2" />
                  {bandLabel && (
                    <text x={tx} y={ty} textAnchor="middle" className="fill-fg-muted font-mono text-[10px]">
                      {bandLabel}
                    </text>
                  )}
                </>
              );
            })()}
          </g>
        )}

        {/* progress: blurred glow underlay + crisp arc */}
        <motion.path
          d={arcPath(0, 1, R)}
          fill="none"
          stroke={`url(#${uid}-arc)`}
          strokeWidth="18"
          strokeLinecap="round"
          filter={`url(#${uid}-glow)`}
          style={{ pathLength: frac, opacity: glow }}
        />
        <motion.path
          d={arcPath(0, 1, R)}
          fill="none"
          stroke={`url(#${uid}-arc)`}
          strokeWidth="12"
          strokeLinecap="round"
          style={{ pathLength: frac }}
        />

        {/* ticks + labels */}
        {Array.from({ length: 51 }, (_, i) => {
          const f = i / 50;
          const major = i % 5 === 0;
          const [x1, y1] = polar(f, R - (major ? 22 : 16));
          const [x2, y2] = polar(f, R - 9);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={major ? 'var(--viz-tick-major)' : 'var(--viz-tick-minor)'}
              strokeOpacity={major ? 0.9 : 0.7}
              strokeWidth={major ? 1.6 : 1}
            />
          );
        })}
        {[1, 2, 3, 4].map((i) => {
          const f = i / 5;
          const [x, y] = polar(f, R - 38);
          return (
            <text key={i} x={x} y={y + 3} textAnchor="middle" className="fill-fg-muted font-mono text-[11.5px]">
              {compact(max * f, max)}
            </text>
          );
        })}

        {/* setpoint marker */}
        {setFrac !== null && (
          <g>
            {(() => {
              const [tx, ty] = polar(setFrac, R + 12);
              const [bx, by] = polar(setFrac, R + 22);
              const a = Math.PI - Math.PI * setFrac;
              const px = Math.sin(a) * 5;
              const py = Math.cos(a) * 5;
              return (
                <>
                  <polygon points={`${tx},${ty} ${bx + px},${by + py} ${bx - px},${by - py}`} fill="var(--viz-amber)" />
                  <text x={bx} y={by - 6} textAnchor="middle" className="fill-amber font-mono text-[10.5px]">
                    SET
                  </text>
                </>
              );
            })()}
          </g>
        )}

        {/* needle */}
        <g ref={needle} transform={`rotate(-90 ${CX} ${CY})`} filter={`url(#${uid}-soft)`}>
          <polygon points={`${CX - 4.5},${CY} ${CX},${CY - R + 14} ${CX + 4.5},${CY}`} fill={live ? 'var(--viz-amber-soft)' : 'var(--viz-needle)'} />
          <polygon points={`${CX - 3},${CY} ${CX},${CY + 18} ${CX + 3},${CY}`} fill="var(--viz-tick-minor)" />
        </g>
        <circle cx={CX} cy={CY} r="11" fill="var(--viz-ink)" stroke={live ? 'var(--viz-amber)' : 'var(--color-accent)'} strokeWidth="2" />
        <circle cx={CX} cy={CY} r="4" fill={live ? 'var(--viz-amber)' : 'var(--color-accent)'} />

        <text x={CX - R} y={CY + 20} textAnchor="middle" className="fill-fg-dim font-mono text-[10.5px]">0</text>
        <text x={CX + R} y={CY + 20} textAnchor="middle" className="fill-fg-dim font-mono text-[10.5px]">{compact(max, max)} {unit}</text>
      </svg>

      <div className="-mt-1 flex items-baseline gap-1.5">
        <RollingNumber
          text={Math.max(0, value).toFixed(decimals ?? (max >= 2000 ? 0 : 1))}
          className={cn('num font-medium', small ? 'text-[26px]' : 'text-[40px]', live ? 'text-fg' : 'text-fg-muted')}
        />
        <span className="num text-sm text-fg-dim">{unit}</span>
      </div>
      <div className="label-tech mt-1 text-[13px] text-accent">{label}</div>

      {!small && (
      <div className="mt-3 grid w-full grid-cols-3 gap-px bg-line text-center">
        <Stat label="Set" value={setpoint > 0 ? `${setpoint}` : '—'} />
        <Stat label="% Set" value={setpoint > 0 ? `${pctOfSet.toFixed(1)}` : '—'} />
        <Stat
          label="State"
          value={state}
          tone={state === 'STABLE' ? 'text-ok' : state === 'RAMPING' || state === 'RUN-DOWN' ? 'text-amber' : 'text-fg-dim'}
        />
      </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = 'text-fg' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-ink-850 px-1 py-2">
      <div className="label-tech text-[11px] text-fg-dim">{label}</div>
      <div className={cn('num mt-0.5 truncate text-[14px]', tone)}>{value}</div>
    </div>
  );
}
