/**
 * The load-loss transformer drawing (same tank, cutaway, core, coils and
 * bushings as components/feature/TransformerVisual), reusable by the
 * instrument tests. Drawn in its own 720 × 360 frame: the HV connection box
 * sits on the left end (where the load-loss variac is), the LV box on the right
 * end, and phase-coloured bus conductors run from each box to its bushings.
 * Place it with <g transform="translate(…)">.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

export type CoilState = 'live' | 'induced' | 'idle';
export type Box = { x: number; y: number; w: number; h: number };

export const LL = {
  HV_XS: [300, 345, 390, 420], // 1U 1V 1W 1N
  LV_XS: [452, 490, 528, 560], // 2u 2v 2w 2n
  HV: { base: 192, height: 82, sheds: 6, width: 30 },
  LV: { base: 192, height: 52, sheds: 3, width: 24 },
  LIMBS: [330, 412, 494],
  BOX_HV: { x: 16, y: 22, w: 112, h: 76 } as Box,
  BOX_LV: { x: 600, y: 22, w: 112, h: 76 } as Box,
} as const;

export const hvTop = LL.HV.base - LL.HV.height;
export const lvTop = LL.LV.base - LL.LV.height;
export const PHASE_COLORS = ['var(--color-phase-r)', 'var(--color-phase-y)', 'var(--color-phase-b)', '#8a929e'];

/** Bushing indices present: 1-phase → 1.1 / 1.2, 3-phase → U V W (+ N). */
export const bushingIdx = (single: boolean, neutral: boolean) => (single ? [0, 2] : neutral ? [0, 1, 2, 3] : [0, 1, 2]);

/**
 * Bus conductors from a connection box to the bushing studs, laid out like the
 * load-loss variac buses: the farthest bushing takes the highest run so no
 * conductor crosses another.
 */
export function busRuns(side: 'HV' | 'LV', idxs: number[], single: boolean) {
  const box = side === 'HV' ? LL.BOX_HV : LL.BOX_LV;
  const xs = side === 'HV' ? LL.HV_XS : LL.LV_XS;
  const edge = side === 'HV' ? box.x + box.w : box.x;
  const top = side === 'HV' ? hvTop : lvTop;
  const n = idxs.length;
  const ys = Array.from({ length: n }, (_, j) => box.y + box.h / 2 - ((n - 1) * 14) / 2 + j * 14);
  const byDist = [...idxs].sort((a, b) => Math.abs(xs[b] - edge) - Math.abs(xs[a] - edge));
  return idxs.map((bi, k) => {
    const y = ys[byDist.indexOf(bi)];
    return {
      bi,
      x: xs[bi],
      y,
      edge,
      d: `M${edge} ${y} H${xs[bi]} V${top - 6}`,
      color: single ? PHASE_COLORS[k === 0 ? 0 : 2] : PHASE_COLORS[bi],
    };
  });
}

/** Gradients/filters the drawing needs; put once inside the parent <svg>. */
export function LoadLossDefs({ id }: { id: (n: string) => string }) {
  return (
    <defs>
      <linearGradient id={id('ll-tank')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--viz-tank-1)" />
        <stop offset="0.5" stopColor="var(--viz-tank-2)" />
        <stop offset="1" stopColor="var(--viz-tank-3)" />
      </linearGradient>
      <linearGradient id={id('ll-shed')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="var(--viz-shed-1)" />
        <stop offset="0.4" stopColor="var(--viz-shed-2)" />
        <stop offset="0.6" stopColor="var(--viz-shed-3)" />
        <stop offset="1" stopColor="var(--viz-shed-4)" />
      </linearGradient>
      <linearGradient id={id('ll-glass')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="var(--viz-glass-1)" />
        <stop offset="1" stopColor="var(--viz-glass-2)" />
      </linearGradient>
      <radialGradient id={id('ll-stress')} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="var(--viz-amber)" stopOpacity="0.55" />
        <stop offset="1" stopColor="var(--viz-amber)" stopOpacity="0" />
      </radialGradient>
      <pattern id={id('ll-stripes')} width="6" height="4" patternUnits="userSpaceOnUse">
        <rect width="6" height="1.2" fill="var(--viz-idle-stroke)" fillOpacity="0.3" />
      </pattern>
    </defs>
  );
}

/** Tank, radiators, cutaway with core + coils, bushings and side labels — as in the load-loss visual. */
export function LoadLossTransformer({
  id,
  single,
  hvIdx,
  lvIdx,
  hvCoils,
  lvCoils,
  hotHv = [],
  hotLv = [],
  live,
  caption,
  hvRole,
  lvRole,
  children,
  oilFill,
  hvCoilFill,
  lvCoilFill,
  radiatorFill,
  behindCoils,
}: {
  id: (n: string) => string;
  single: boolean;
  hvIdx: number[];
  lvIdx: number[];
  /** State of each limb's HV / LV coil (limb 0 … 2) */
  hvCoils: CoilState[];
  lvCoils: CoilState[];
  hotHv?: number[];
  hotLv?: number[];
  live: boolean;
  caption: string;
  hvRole: string;
  lvRole: string;
  /** Drawn inside the cutaway, above the coils (e.g. a stress glow) */
  children?: ReactNode;
  /** Override the cutaway (oil) fill, e.g. a temperature gradient */
  oilFill?: string;
  /** Override every HV / LV coil's fill (state stroke is kept) */
  hvCoilFill?: string;
  lvCoilFill?: string;
  /** Override the radiator fin fill */
  radiatorFill?: string;
  /** Drawn inside the cutaway, behind the core and coils (e.g. oil convection) */
  behindCoils?: ReactNode;
}) {
  const limbs = single ? [LL.LIMBS[0], LL.LIMBS[2]] : LL.LIMBS;
  const limbIdx = single ? [0, 2] : [0, 1, 2];
  const C = { amber: 'var(--viz-amber)', wire: 'var(--viz-wire)', violet: 'var(--viz-violet)', fuchsia: 'var(--viz-fuchsia)', idle: 'var(--viz-idle-stroke)' };
  return (
    <g>
      <rect x="236" y="338" width="356" height="10" fill="var(--viz-base)" />
      {/* radiators */}
      {[236, 564].map((x0) => (
        <g key={x0}>
          {Array.from({ length: 6 }, (_, i) => (
            <rect key={i} x={x0 + i * 4.4} y="214" width="2.8" height="104" rx="1.2" fill={radiatorFill ?? 'var(--viz-radiator)'} stroke="var(--viz-metal)" strokeWidth="0.6" />
          ))}
          <rect x={x0 - 1} y="210" width="28" height="4" fill="var(--viz-metal)" />
          <rect x={x0 - 1} y="318" width="28" height="4" fill="var(--viz-metal)" />
        </g>
      ))}
      {/* tank */}
      <rect x="270" y="330" width="284" height="8" rx="2" fill="var(--viz-base)" stroke="var(--viz-metal)" strokeWidth="0.8" />
      <rect x="262" y="200" width="300" height="130" rx="10" fill={`url(#${id('ll-tank')})`} stroke={live ? C.amber : C.wire} strokeWidth="2" />
      <rect x="254" y="190" width="316" height="12" rx="3" fill="var(--viz-cover)" stroke={live ? C.amber : C.wire} strokeWidth="1.4" />
      <rect x="284" y="210" width="256" height="104" rx="6" fill={oilFill ?? `url(#${id('ll-glass')})`} stroke={C.violet} strokeOpacity="0.55" strokeWidth="1.1" />
      {behindCoils}
      {/* core */}
      <g className={cn(live && 'flux')}>
        <rect x="300" y="216" width="224" height="9" rx="1.5" fill="var(--viz-core)" stroke={live ? C.fuchsia : C.idle} strokeWidth="1.1" />
        <rect x="300" y="299" width="224" height="9" rx="1.5" fill="var(--viz-core)" stroke={live ? C.fuchsia : C.idle} strokeWidth="1.1" />
      </g>
      {limbs.map((cx, k) => (
        <g key={cx}>
          <Coil x={cx - 27} y={230} w={54} h={64} state={hvCoils[limbIdx[k]] ?? 'idle'} stripes={id('ll-stripes')} fillOverride={hvCoilFill} />
          <Coil x={cx - 17} y={235} w={34} h={54} state={lvCoils[limbIdx[k]] ?? 'idle'} stripes={id('ll-stripes')} fillOverride={lvCoilFill} />
          <rect x={cx - 6} y="225" width="12" height="74" fill="var(--viz-core)" stroke={live ? C.fuchsia : C.idle} strokeWidth="1.1" className={cn(live && 'flux')} />
        </g>
      ))}
      <text x="292" y="222" className="fill-fg-muted font-mono text-[8px]">CORE</text>
      <text x="532" y="310" textAnchor="end" className="fill-fg-muted font-mono text-[8px]">HV OUTER · LV INNER</text>
      {children}
      <text x="412" y="324" textAnchor="middle" className="fill-fg font-mono text-[10px]">
        {caption}
      </text>
      {/* bushings */}
      {hvIdx.map((bi) => (
        <Bushing key={`hv${bi}`} x={LL.HV_XS[bi]} spec={LL.HV} shed={id('ll-shed')} hot={hotHv.includes(bi)} />
      ))}
      {lvIdx.map((bi) => (
        <Bushing key={`lv${bi}`} x={LL.LV_XS[bi]} spec={LL.LV} shed={id('ll-shed')} hot={hotLv.includes(bi)} />
      ))}
      <SideLabel x={272} y={150} anchor="end" name="HV" role={hvRole} live={live && hotHv.length > 0} />
      <SideLabel x={600} y={124} anchor="start" name="LV" role={lvRole} live={live && hotLv.length > 0} />
    </g>
  );
}

/** Connection box at one end, styled like the load-loss variac box, with a terminal dot per bus. */
export function SupplyBox({
  side,
  title,
  value,
  unit,
  live,
  runs,
  note,
}: {
  side: 'HV' | 'LV';
  title: string;
  value: string;
  unit: string;
  live: boolean;
  runs: Array<{ y: number; edge: number; color: string }>;
  note?: string;
}) {
  const b = side === 'HV' ? LL.BOX_HV : LL.BOX_LV;
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="6" fill="var(--viz-box)" stroke={live ? 'var(--viz-amber)' : 'var(--viz-violet)'} strokeWidth="1.5" />
      <text x={b.x + 12} y={b.y + 16} className={cn('font-display text-[11px] font-bold tracking-[0.14em]', live ? 'fill-amber' : 'fill-accent-soft')}>
        {title}
      </text>
      <text x={b.x + 12} y={b.y + 44} className="fill-fg font-mono text-[15px] font-medium">
        {value}
      </text>
      <text x={b.x + 12} y={b.y + 58} className="fill-fg-dim font-mono text-[9.5px]">
        {unit}
      </text>
      {note && (
        <text x={b.x + 12} y={b.y + 70} className={cn('font-mono text-[8.5px] font-semibold', live ? 'fill-amber' : 'fill-fg-muted')}>
          {note}
        </text>
      )}
      {runs.map((r) => (
        <circle key={r.y} cx={r.edge} cy={r.y} r="3" fill={live ? r.color : 'var(--viz-wire)'} stroke="var(--viz-ink)" strokeWidth="1" />
      ))}
    </g>
  );
}

function Coil({ x, y, w, h, state, stripes, fillOverride }: { x: number; y: number; w: number; h: number; state: CoilState; stripes: string; fillOverride?: string }) {
  const stroke = state === 'live' ? 'var(--viz-amber)' : state === 'induced' ? 'var(--viz-violet)' : 'var(--viz-idle-stroke)';
  const fill = fillOverride ?? (state === 'live' ? 'var(--viz-live-fill)' : state === 'induced' ? 'var(--viz-induced-fill)' : 'var(--viz-idle-fill)');
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="3" fill={fill} stroke={stroke} strokeWidth="1.3" className={cn(state === 'live' && !fillOverride && 'pulse-soft')} />
      <rect x={x} y={y} width={w} height={h} rx="3" fill={`url(#${stripes})`} />
    </g>
  );
}

function Bushing({ x, spec, shed, hot }: { x: number; spec: { base: number; height: number; sheds: number; width: number }; shed: string; hot: boolean }) {
  const topY = spec.base - spec.height;
  const step = (spec.height - 16) / spec.sheds;
  return (
    <g>
      <rect x={x - 3} y={topY} width="6" height={spec.height} fill="var(--viz-stem)" />
      {Array.from({ length: spec.sheds }, (_, i) => (
        <rect
          key={i}
          x={x - spec.width / 2}
          y={topY + 10 + i * step}
          width={spec.width}
          height={Math.min(8, step - 2)}
          rx={Math.min(4, (step - 2) / 2)}
          fill={`url(#${shed})`}
          stroke={hot ? 'var(--viz-amber)' : 'var(--viz-violet)'}
          strokeOpacity={hot ? 1 : 0.55}
          strokeWidth="0.9"
        />
      ))}
      <rect x={x - spec.width / 2 - 3} y={spec.base - 6} width={spec.width + 6} height="6" rx="1.5" fill="var(--viz-metal)" />
      <rect x={x - 5} y={topY - 7} width="10" height="8" rx="1.5" fill={hot ? 'var(--viz-amber)' : 'var(--viz-copper)'} />
    </g>
  );
}

function SideLabel({ x, y, anchor, name, role, live }: { x: number; y: number; anchor: 'start' | 'end'; name: string; role: string; live: boolean }) {
  return (
    <g>
      <text x={x} y={y} textAnchor={anchor} className="fill-fg font-display text-[17px] font-bold tracking-[0.12em]">
        {name}
      </text>
      <text x={x} y={y + 13} textAnchor={anchor} className={cn('font-mono text-[9.5px]', live ? 'fill-amber' : 'fill-fg-muted')}>
        {role}
      </text>
    </g>
  );
}
