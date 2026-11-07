import type { LucideIcon } from 'lucide-react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useId, useMemo, type MouseEvent, type ReactNode } from 'react';
import { powerUp } from '@/components/ui';
import { cn } from '@/lib/format';

export interface MetricReference {
  /** value the bar is measured against */
  value: number;
  label: string;
}

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  code: string;
  value: number | null;
  unit: string;
  decimals?: number;
  history?: number[];
  reference?: MetricReference | null;
  peak?: number | null;
  live?: boolean;
  /** Showing the last energised value (held after the source dropped) */
  held?: boolean;
  /** Override the default value formatter (e.g. W → kW) */
  format?: (v: number) => string;
  footer?: ReactNode;
}

/**
 * Live readout card: spring count-up value, sparkline, reference bar,
 * 3D hover tilt with a cursor-tracking spotlight (transform-only).
 */
export function MetricCard({
  icon: Icon,
  label,
  code,
  value,
  unit,
  decimals = 1,
  history = [],
  reference,
  peak,
  live = false,
  held = false,
  format,
  footer,
}: MetricCardProps) {
  const reduce = useReducedMotion();

  // ── value spring ─────────────────────────────────────
  const spring = useSpring(value ?? 0, { stiffness: 120, damping: 20 });
  useEffect(() => {
    if (value !== null) spring.set(value);
  }, [value, spring]);
  const fmt = format ?? ((v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  const text = useTransform(spring, (v) => fmt(Math.max(0, v)));

  // ── tilt + spotlight ────────────────────────────────
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [6, -6]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(mx, [0, 1], [-8, 8]), { stiffness: 200, damping: 20 });
  // spotlight is 160px; these ranges sweep its centre across the card
  const sx = useTransform(mx, [0, 1], ['-50%', '100%']);
  const sy = useTransform(my, [0, 1], ['-50%', '90%']);

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };
  const onLeave = () => {
    mx.set(0.5);
    my.set(0.5);
  };

  const pct = reference && value !== null && reference.value > 0 ? (value / reference.value) * 100 : null;

  return (
    <motion.div variants={powerUp} className="[perspective:900px]">
      <motion.div
        onMouseMove={reduce ? undefined : onMove}
        onMouseLeave={onLeave}
        style={reduce ? undefined : { rotateX: rx, rotateY: ry }}
        whileHover={reduce ? undefined : { y: -3 }}
        data-active={live ? 'true' : undefined}
        tabIndex={0}
        aria-label={`${label}: ${value === null ? 'no reading' : `${fmt(value)} ${unit}`}`}
        className={cn(
          'edge-light group relative h-full overflow-hidden border bg-ink-850/90 p-4 transition-colors duration-300',
          live ? 'border-amber/40' : 'border-line hover:border-accent/50',
        )}
      >
        {/* spotlight */}
        {!reduce && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 size-40 rounded-full bg-accent/20 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
            style={{ x: sx, y: sy }}
          />
        )}
        {/* live glow */}
        {live && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-amber/25 blur-2xl"
            animate={reduce ? undefined : { opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
        )}

        <div className="relative flex items-center gap-2.5">
          <div
            className={cn(
              'grid size-8 place-items-center border transition-colors',
              live ? 'border-amber/60 bg-amber/10 text-amber' : 'border-line-strong text-accent group-hover:border-accent/60',
            )}
          >
            <Icon className="size-4" strokeWidth={1.8} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="label-tech truncate text-[13px] text-fg">{label}</div>
            <div className="num text-[12px] text-fg-dim">{code}</div>
          </div>
          {live ? (
            <span className="num ml-auto flex items-center gap-1 text-[12px] text-amber">
              <span className="size-1.5 animate-blink rounded-full bg-amber" aria-hidden />
              LIVE
            </span>
          ) : held ? (
            <span className="num ml-auto border border-accent/50 px-1 text-[12px] text-accent">HOLD</span>
          ) : null}
        </div>

        <div className="relative mt-3 flex items-baseline gap-1.5">
          {value === null ? (
            <span className="num text-[30px] font-medium leading-none text-fg-dim">--</span>
          ) : (
            <motion.span className="num text-[30px] font-medium leading-none text-fg">{text}</motion.span>
          )}
          <span className="num text-xs text-fg-dim">{unit}</span>
        </div>

        <Sparkline data={history} live={live} />

        <div className="relative mt-2">
          {reference ? (
            <>
              <div className="num mb-1 flex justify-between text-[12px] text-fg-dim">
                <span>{reference.label}</span>
                <span className={cn(pct !== null && pct > 100 ? 'text-fault' : 'text-fg-muted')}>
                  {pct === null ? '--' : `${pct.toFixed(pct < 10 ? 1 : 0)}%`}
                </span>
              </div>
              <div className="relative h-1 overflow-hidden bg-ink-700">
                <motion.div
                  className={cn('absolute inset-y-0 left-0 w-full origin-left', pct !== null && pct > 100 ? 'bg-fault' : 'bg-accent-grad')}
                  animate={{ scaleX: Math.min(1, (pct ?? 0) / 100) }}
                  transition={{ type: 'spring', stiffness: 140, damping: 22 }}
                />
              </div>
            </>
          ) : (
            footer
          )}
          {peak !== undefined && peak !== null && (
            <div className="num mt-1.5 text-[12px] text-fg-dim">
              PEAK <span className="text-fg-muted">{peak > 0 ? fmt(peak) : '--'}</span> {peak > 0 ? unit : ''}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Sparkline({ data, live }: { data: number[]; live: boolean }) {
  const uid = useId().replace(/:/g, '');
  const W = 120;
  const H = 30;
  const { line, area } = useMemo(() => {
    if (data.length < 2) return { line: '', area: '' };
    const max = Math.max(...data, 1e-9);
    const min = Math.min(...data, 0);
    const span = max - min || 1;
    const pts = data.map((v, i) => [(i / (data.length - 1)) * W, H - 2 - ((v - min) / span) * (H - 4)] as [number, number]);
    const l = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    return { line: l, area: `${l} L${W} ${H} L0 ${H} Z` };
  }, [data]);

  const color = live ? 'var(--viz-amber)' : 'var(--color-accent)';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="relative mt-2 h-8 w-full" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {line ? (
        <>
          <path d={area} fill={`url(#${uid}-a)`} />
          <path d={line} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        </>
      ) : (
        <line x1="0" y1={H - 2} x2={W} y2={H - 2} stroke="var(--color-line-strong)" strokeDasharray="3 4" />
      )}
    </svg>
  );
}
