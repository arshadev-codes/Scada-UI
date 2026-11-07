/**
 * Reading log for the long tests: every new row is "stuck on" like a printed
 * label — it drops in slightly tilted, the tape unrolls left → right, its
 * curled corner flattens, and a shine runs across it. Newest row on top.
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

export interface LogColumn<T> {
  key: string;
  label: string;
  /** CSS grid track, default minmax(0,1fr) */
  width?: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
}

export function StickerLog<T extends { id: number }>({
  rows,
  columns,
  tone,
  empty,
  maxHeight = 360,
}: {
  rows: T[];
  columns: LogColumn<T>[];
  /** Coloured tab on the left of a row */
  tone?: (row: T) => string;
  empty: string;
  maxHeight?: number;
}) {
  const reduce = useReducedMotion();
  const grid = { gridTemplateColumns: columns.map((c) => c.width ?? 'minmax(0,1fr)').join(' ') };
  const newestId = rows.length ? rows[rows.length - 1].id : -1;
  const shown = [...rows].reverse();
  const align = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

  return (
    <div className="num text-[14px]">
      <div className="grid gap-3 border-b border-line px-4 pb-2 text-[12.5px] text-fg-dim" style={grid}>
        {columns.map((c) => (
          <div key={c.key} className={align(c.align)}>
            {c.label}
          </div>
        ))}
      </div>
      <div className="relative mt-2 overflow-y-auto overflow-x-hidden pr-1" style={{ maxHeight, perspective: 900 }}>
        {rows.length === 0 && <div className="px-4 py-6 text-center text-fg-dim">{empty}</div>}
        <AnimatePresence initial={false}>
          {shown.map((row) => {
            const fresh = row.id === newestId;
            return (
              <motion.div
                key={row.id}
                layout={!reduce}
                initial={
                  reduce
                    ? { opacity: 0 }
                    : { opacity: 0, y: -22, rotate: -2.2, rotateX: 38, scale: 1.035, clipPath: 'inset(0 100% 0 0 round 8px)' }
                }
                animate={{ opacity: 1, y: 0, rotate: 0, rotateX: 0, scale: 1, clipPath: 'inset(0 0% 0 0 round 8px)' }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={{
                  type: 'spring',
                  stiffness: 260,
                  damping: 22,
                  clipPath: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
                  layout: { type: 'spring', stiffness: 300, damping: 30 },
                }}
                className={cn(
                  'relative mb-1.5 overflow-hidden rounded-[8px] border bg-ink-850 shadow-[0_1px_0_rgb(0_0_0/0.06)]',
                  fresh ? 'border-[var(--live)]' : 'border-line',
                )}
                style={{ transformOrigin: 'left center' }}
              >
                {/* coloured tab, like the edge of a printed label */}
                <span className={cn('absolute inset-y-0 left-0 w-1.5', tone?.(row) ?? 'bg-accent')} aria-hidden />
                <div className="grid items-center gap-3 py-2 pr-4 pl-5" style={grid}>
                  {columns.map((c) => (
                    <div key={c.key} className={cn('truncate', align(c.align))}>
                      {c.render(row)}
                    </div>
                  ))}
                </div>
                {!reduce && (
                  <>
                    {/* shine sweeping across once it is pressed down */}
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 w-24 -skew-x-12 bg-white/40"
                      initial={{ left: '-20%', opacity: 0 }}
                      animate={{ left: '120%', opacity: [0, 0.8, 0] }}
                      transition={{ duration: 0.9, delay: 0.35, ease: 'easeOut' }}
                    />
                    {/* curled corner that flattens */}
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute top-0 right-0 size-5 origin-top-right"
                      style={{ background: 'linear-gradient(225deg, var(--color-ink-800) 50%, var(--color-line-strong) 50%)', boxShadow: '-2px 2px 3px rgb(0 0 0 / 0.15)' }}
                      initial={{ scale: 1.6, opacity: 1 }}
                      animate={{ scale: 0, opacity: 0 }}
                      transition={{ duration: 0.45, delay: 0.55, ease: 'easeIn' }}
                    />
                  </>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Sequence strip of named phases; `current` is lit, earlier ones are done. */
export function PhaseSteps<K extends string>({ steps, current, finished }: { steps: Array<{ key: K; label: string; sub: string }>; current: K | null; finished: boolean }) {
  const idx = current ? steps.findIndex((s) => s.key === current) : -1;
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => {
        const done = finished || i < idx;
        const active = !finished && i === idx;
        return (
          <li
            key={s.key}
            className={cn(
              'relative overflow-hidden rounded-[10px] border px-3 py-2.5 text-center transition-colors duration-300',
              active ? 'border-[var(--live)] bg-amber-deep/50 text-amber' : done ? 'border-ok/35 bg-ok/[0.07] text-ok' : 'border-line bg-ink-800 text-fg-dim',
            )}
          >
            <div className="label-tech text-[13px]">{s.label}</div>
            <div className="num text-[12px] opacity-80">{s.sub}</div>
          </li>
        );
      })}
    </ol>
  );
}

/** Ring countdown for the withstand time. */
export function WithstandTimer({ elapsed, total, active, label }: { elapsed: number; total: number; active: boolean; label: string }) {
  const f = total > 0 ? Math.min(1, elapsed / total) : 0;
  const left = Math.max(0, Math.ceil(total - elapsed));
  const R = 44;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-4 rounded-[10px] border border-line bg-ink-800 px-4 py-3">
      <svg viewBox="0 0 110 110" className="size-[96px] shrink-0" role="img" aria-label={`${label}: ${left} s left`}>
        <circle cx="55" cy="55" r={R} fill="none" stroke="var(--viz-track)" strokeWidth="9" />
        <motion.circle
          cx="55"
          cy="55"
          r={R}
          fill="none"
          stroke={f >= 1 ? 'var(--color-ok)' : 'var(--viz-amber)'}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={C}
          animate={{ strokeDashoffset: C * (1 - f) }}
          transition={{ duration: 0.3, ease: 'linear' }}
          transform="rotate(-90 55 55)"
        />
        {active && f < 1 && (
          <motion.circle cx="55" cy="55" r={R + 6} fill="none" stroke="var(--viz-amber)" strokeWidth="1" animate={{ opacity: [0.6, 0], r: [R + 2, R + 12] }} transition={{ duration: 1, repeat: Infinity }} />
        )}
        <text x="55" y="58" textAnchor="middle" className="fill-fg font-mono text-[24px] font-semibold">
          {left}
        </text>
        <text x="55" y="76" textAnchor="middle" className="fill-fg-dim font-mono text-[10px]">
          s left
        </text>
      </svg>
      <div className="num min-w-0 text-[13px]">
        <div className="label-tech text-[13px] text-accent">{label}</div>
        <div className="mt-1 text-fg">
          {Math.min(total, elapsed).toFixed(0)} / {total} s
        </div>
        <div className={cn('mt-0.5', f >= 1 ? 'text-ok' : active ? 'text-amber' : 'text-fg-dim')}>{f >= 1 ? 'WITHSTOOD' : active ? 'HOLDING' : 'WAITING'}</div>
      </div>
    </div>
  );
}
