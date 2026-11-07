import { useId, type CSSProperties } from 'react';
import { connectionLabel, otherSide, type Side } from '@/config/tests';
import { cn } from '@/lib/format';

interface TransformerVisualProps {
  /** OUT1 / Y0 read back — variac output connected */
  out1: boolean;
  /** Live variac output read back, V */
  variacV: number;
  side: Side;
  otherWinding: 'open' | 'short';
  phases: '1' | '3';
  serial?: string;
  kva?: string;
}

// ── Geometry (viewBox 600 × 360) ──────────────────────────────────────────────
const BUS_Y = [44, 60, 76] as const;
const BUS_START = 128;
const HV = { xs: [300, 345, 390], base: 192, height: 82, sheds: 6, width: 30 } as const;
const LV = { xs: [452, 490, 528], base: 192, height: 52, sheds: 3, width: 24 } as const;
const LIMBS = [330, 412, 494] as const;

const C = {
  // Theme-aware: values come from CSS variables defined per theme in index.css
  amber: 'var(--viz-amber)',
  amberSoft: 'var(--viz-amber-soft)',
  violet: 'var(--viz-violet)',
  fuchsia: 'var(--viz-fuchsia)',
  idleStroke: 'var(--viz-idle-stroke)',
  idleFill: 'var(--viz-idle-fill)',
  wire: 'var(--viz-wire)',
  copper: 'var(--viz-copper)',
  ink: 'var(--viz-ink)',
  phase: ['var(--color-phase-r)', 'var(--color-phase-y)', 'var(--color-phase-b)'],
} as const;

type CoilState = 'live' | 'induced' | 'idle';

/** Entrance delay for the enter-* classes (index.css). */
const d = (s: number) => ({ '--d': `${s}s` }) as CSSProperties;

/**
 * Transformer under test, driven by PLC read-back.
 *   - Variac → energised bushings, R/Y/B conductors; current flows while Y0 is on.
 *   - Energised winding glows; a shorted winding glows too (it carries current);
 *     an open winding shows only induced voltage.
 */
export function TransformerVisual({ out1, variacV, side, otherWinding, phases, serial, kva }: TransformerVisualProps) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${uid}-${n}`;

  const bushingIdx = phases === '3' ? [0, 1, 2] : [0, 2];
  const n = bushingIdx.length;
  const live = out1;
  const shorted = otherWinding === 'short';

  const src = side === 'HV' ? HV : LV;
  const dst = side === 'HV' ? LV : HV;
  const top = (b: typeof HV | typeof LV) => b.base - b.height;

  const coil = (s: Side): CoilState => (!live ? 'idle' : s === side ? 'live' : shorted ? 'live' : 'induced');

  const conductors = bushingIdx.map((bi, j) => {
    const x = src.xs[bi];
    const y = BUS_Y[n === 3 ? n - 1 - j : j === 0 ? 1 : 0];
    return {
      key: bi,
      color: C.phase[phases === '3' ? bi : j === 0 ? 0 : 2],
      d: `M${BUS_START} ${y} H${x} V${top(src) - 6}`,
    };
  });

  const dstTops = bushingIdx.map((bi) => dst.xs[bi]);
  const linkY = top(dst) - 18;
  const linkLive = live && shorted;

  return (
    <figure className={cn('relative', live && 'hum')}>
      <svg
        viewBox="0 0 600 360"
        className="h-auto w-full"
        role="img"
        aria-label={`Transformer: ${connectionLabel(side, otherWinding)}. Variac ${live ? `connected, ${Math.round(variacV)} volts` : 'disconnected'}.`}
      >
        <defs>
          <linearGradient id={id('tank')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--viz-tank-1)" />
            <stop offset="0.5" stopColor="var(--viz-tank-2)" />
            <stop offset="1" stopColor="var(--viz-tank-3)" />
          </linearGradient>
          <linearGradient id={id('edge')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--viz-violet)" />
            <stop offset="0.5" stopColor="var(--viz-violet)" />
            <stop offset="1" stopColor="var(--viz-violet)" />
          </linearGradient>
          <linearGradient id={id('shed')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--viz-shed-1)" />
            <stop offset="0.4" stopColor="var(--viz-shed-2)" />
            <stop offset="0.6" stopColor="var(--viz-shed-3)" />
            <stop offset="1" stopColor="var(--viz-shed-4)" />
          </linearGradient>
          <linearGradient id={id('glass')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--viz-glass-1)" />
            <stop offset="1" stopColor="var(--viz-glass-2)" />
          </linearGradient>
          <radialGradient id={id('spot')} cx="0.5" cy="0.55" r="0.5">
            <stop offset="0" stopColor={live ? 'var(--viz-amber)' : 'var(--viz-violet)'} stopOpacity={live ? 0.2 : 0.22} />
            <stop offset="1" stopColor="var(--viz-violet)" stopOpacity="0" />
          </radialGradient>
          <pattern id={id('stripes')} width="6" height="4" patternUnits="userSpaceOnUse">
            <rect width="6" height="1.2" fill="var(--viz-idle-stroke)" fillOpacity="0.3" />
          </pattern>
          <filter id={id('glow')} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={id('halo')} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="0" />
          </filter>
        </defs>

        {/* focus spotlight behind the transformer */}

        {/* plinth */}
        <rect x="236" y="338" width="356" height="10" fill="var(--viz-base)" className="enter-fade" />

        {/* ── Variac ─────────────────────────────────────────────── */}
        <g className="enter-pop" style={d(0.2)}>
          <rect x="16" y="22" width="112" height="76" rx="6" fill="var(--viz-box)" stroke={live ? C.amber : C.violet} strokeWidth="1.5" />
          <text x="28" y="38" className={cn('font-display text-[11.5px] font-bold tracking-[0.18em]', live ? 'fill-amber' : 'fill-accent-soft')}>
            VARIAC
          </text>
          {/* knob */}
          <circle cx="44" cy="66" r="15" fill="var(--viz-ink)" stroke={live ? C.amber : C.idleStroke} strokeWidth="1.4" />
          <circle cx="44" cy="66" r="10" fill="none" stroke="var(--color-line-strong)" strokeDasharray="1.5 2.5" />
          <line
            x1="44"
            y1="66"
            x2="44"
            y2="54"
            stroke={live ? C.amber : C.copper}
            strokeWidth="2"
            strokeLinecap="round"
            style={{
              transform: `rotate(${live ? 110 : -120}deg)`,
              transformOrigin: '44px 66px',
              transformBox: 'view-box',
              transition: 'transform 1.2s cubic-bezier(0.22,1,0.36,1)',
            }}
          />
          <text x="68" y="64" className="fill-fg font-mono text-[13px] font-medium">
            {Math.round(variacV)}
          </text>
          <text x="68" y="78" className="fill-fg-dim font-mono text-[9.5px]">
            VOLTS
          </text>
          {BUS_Y.map((y, k) => (
            <circle key={y} cx={BUS_START} cy={y} r="3" fill={live ? C.phase[k] : C.wire} stroke={C.ink} strokeWidth="1" />
          ))}
        </g>

        {/* ── Conductors (base) ─────────────────────────────────── */}
        {conductors.map((c, j) => (
          <path
            key={c.key}
            d={c.d}
            pathLength={1}
            fill="none"
            stroke={live ? c.color : C.wire}
            strokeOpacity={live ? 0.45 : 1}
            strokeWidth="2.2"
            className="enter-draw"
            style={d(1 + j * 0.1)}
          />
        ))}

        {/* ── Conductors (flowing current) ──────────────────────── */}
        {live && (
          <g filter={`url(#${id('glow')})`}>
            {conductors.map((c) => (
              <path key={c.key} d={c.d} fill="none" stroke={c.color} strokeWidth="2.6" strokeLinecap="round" className="flow" />
            ))}
          </g>
        )}

        {/* ── Radiators ─────────────────────────────────────────── */}
        {[236, 564].map((x0, k) => (
          <g key={x0} className="enter-grow" style={d(0.4 + k * 0.08)}>
            {Array.from({ length: 6 }, (_, i) => (
              <rect key={i} x={x0 + i * 4.4} y="214" width="2.8" height="104" rx="1.2" fill="var(--viz-radiator)" stroke="var(--viz-metal)" strokeWidth="0.6" />
            ))}
            <rect x={x0 - 1} y="210" width="28" height="4" fill="var(--viz-metal)" />
            <rect x={x0 - 1} y="318" width="28" height="4" fill="var(--viz-metal)" />
          </g>
        ))}

        {/* ── Tank ──────────────────────────────────────────────── */}
        <g className="enter-rise" style={d(0.1)}>
        <rect x="270" y="330" width="284" height="8" rx="2" fill="var(--viz-base)" stroke="var(--viz-metal)" strokeWidth="0.8" />
        <rect x="262" y="200" width="300" height="130" rx="10" fill={`url(#${id('tank')})`} stroke={live ? C.amber : C.wire} strokeWidth="2" />
        <rect x="254" y="190" width="316" height="12" rx="3" fill="var(--viz-cover)" stroke={live ? C.amber : C.wire} strokeWidth="1.4" />

        {/* cutaway window */}
        <rect x="284" y="210" width="256" height="104" rx="6" fill={`url(#${id('glass')})`} stroke={C.violet} strokeOpacity="0.55" strokeWidth="1.1" />
        </g>

        {/* core: yokes + limbs */}
        <g className="enter-fade" style={d(0.5)}>
        <g className={cn(live && 'flux')}>
          <rect x="300" y="216" width="224" height="9" rx="1.5" fill="var(--viz-core)" stroke={live ? C.fuchsia : C.idleStroke} strokeWidth="1.1" />
          <rect x="300" y="299" width="224" height="9" rx="1.5" fill="var(--viz-core)" stroke={live ? C.fuchsia : C.idleStroke} strokeWidth="1.1" />
        </g>
        </g>
        {LIMBS.map((cx, k) => (
          <g key={cx} className="enter-drop" style={d(0.55 + k * 0.1)}>
            <Coil x={cx - 27} y={230} w={54} h={64} state={coil('HV')} stripes={id('stripes')} glow={id('glow')} />
            <Coil x={cx - 17} y={235} w={34} h={54} state={coil('LV')} stripes={id('stripes')} glow={id('glow')} />
            <rect x={cx - 6} y="225" width="12" height="74" fill="var(--viz-core)" stroke={live ? C.fuchsia : C.idleStroke} strokeWidth="1.1" className={cn(live && 'flux')} />
          </g>
        ))}
        <text x="292" y="222" className="fill-fg-muted font-mono text-[8px]">CORE</text>
        <text x="532" y="310" textAnchor="end" className="fill-fg-muted font-mono text-[8px]">HV OUTER · LV INNER</text>

        {/* nameplate strip */}
        <text x="412" y="324" textAnchor="middle" className="fill-fg font-mono text-[10px]">
          {[serial, kva ? `${kva} kVA` : null].filter(Boolean).join('  ·  ') || 'TEST OBJECT'}
        </text>

        {/* ── Bushings ─────────────────────────────────────────── */}
        {bushingIdx.map((bi, k) => (
          <g key={`hv${bi}`} className="enter-drop" style={d(0.8 + k * 0.07)}>
            <Bushing x={HV.xs[bi]} spec={HV} shed={id('shed')} hot={live && (side === 'HV' || shorted)} glow={id('glow')} />
          </g>
        ))}
        {bushingIdx.map((bi, k) => (
          <g key={`lv${bi}`} className="enter-drop" style={d(0.95 + k * 0.07)}>
            <Bushing x={LV.xs[bi]} spec={LV} shed={id('shed')} hot={live && (side === 'LV' || shorted)} glow={id('glow')} />
          </g>
        ))}

        {/* ── Termination of the other winding + labels ────────── */}
        <g className="enter-fade" style={d(1.25)}>
        {shorted ? (
          <g>
            <path
              d={`M${dstTops[0] - 8} ${linkY} H${dstTops[dstTops.length - 1] + 8} ${dstTops.map((x) => `M${x} ${linkY} V${top(dst) - 6}`).join(' ')}`}
              fill="none"
              stroke={linkLive ? C.amber : C.copper}
              strokeWidth="3.4"
              strokeLinecap="round"
            />
            {linkLive && (
              <path
                d={`M${dstTops[0] - 8} ${linkY} H${dstTops[dstTops.length - 1] + 8}`}
                fill="none"
                stroke={C.amberSoft}
                strokeWidth="2"
                className="flow"
                filter={`url(#${id('glow')})`}
              />
            )}
            <text
              x={(dstTops[0] + dstTops[dstTops.length - 1]) / 2}
              y={linkY - 8}
              textAnchor="middle"
              className={cn('font-mono text-[9.5px]', linkLive ? 'fill-amber' : 'fill-fg')}
            >
              SHORT-CIRCUIT LINK
            </text>
          </g>
        ) : (
          <g>
            {dstTops.map((x) => (
              <circle key={x} cx={x} cy={top(dst) - 10} r="3" fill={C.ink} stroke={live ? C.violet : C.idleStroke} strokeWidth="1.4" />
            ))}
            <text x={(dstTops[0] + dstTops[dstTops.length - 1]) / 2} y={top(dst) - 20} textAnchor="middle" className="fill-fg-muted font-mono text-[9.5px]">
              OPEN{live ? ' · INDUCED' : ''}
            </text>
          </g>
        )}

        {/* ── Side labels ──────────────────────────────────────── */}
        <SideLabel x={272} y={150} anchor="end" name="HV" role={side === 'HV' ? 'supply' : otherWinding} live={live} />
        <SideLabel x={546} y={168} anchor="start" name="LV" role={side === 'LV' ? 'supply' : otherWinding} live={live} />
        </g>
      </svg>
      <div className="svg-scan" aria-hidden />

      <figcaption className="mt-1 flex items-center justify-center gap-2">
        <span className={cn('size-1.5 rounded-full', live ? 'bg-amber' : 'bg-accent')} aria-hidden />
        <span className="num text-[13px] text-fg">
          {connectionLabel(side, otherWinding).toUpperCase()}
          <span className="text-fg-muted"> · {otherSide(side)} {shorted ? 'CARRIES CIRCULATING CURRENT' : 'NO-LOAD'}</span>
        </span>
      </figcaption>
    </figure>
  );
}

function Coil({ x, y, w, h, state, stripes, glow }: { x: number; y: number; w: number; h: number; state: CoilState; stripes: string; glow: string }) {
  const stroke = state === 'live' ? C.amber : state === 'induced' ? C.violet : C.idleStroke;
  const fill = state === 'live' ? 'var(--viz-live-fill)' : state === 'induced' ? 'var(--viz-induced-fill)' : C.idleFill;
  return (
    <g filter={state === 'live' ? `url(#${glow})` : undefined}>
      <rect x={x} y={y} width={w} height={h} rx="3" fill={fill} stroke={stroke} strokeWidth="1.3" className={cn(state === 'live' && 'pulse-soft')} />
      <rect x={x} y={y} width={w} height={h} rx="3" fill={`url(#${stripes})`} />
    </g>
  );
}

function Bushing({ x, spec, shed, hot, glow }: { x: number; spec: typeof HV | typeof LV; shed: string; hot: boolean; glow: string }) {
  const topY = spec.base - spec.height;
  const step = (spec.height - 16) / spec.sheds;
  return (
    <g filter={hot ? `url(#${glow})` : undefined}>
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
          stroke={hot ? C.amber : C.violet}
          strokeOpacity={hot ? 1 : 0.55}
          strokeWidth="0.9"
        />
      ))}
      <rect x={x - spec.width / 2 - 3} y={spec.base - 6} width={spec.width + 6} height="6" rx="1.5" fill="var(--viz-metal)" />
      <rect x={x - 5} y={topY - 7} width="10" height="8" rx="1.5" fill={hot ? C.amber : C.copper} />
    </g>
  );
}

function SideLabel({
  x,
  y,
  anchor,
  name,
  role,
  live,
}: {
  x: number;
  y: number;
  anchor: 'start' | 'end';
  name: string;
  role: 'supply' | 'open' | 'short';
  live: boolean;
}) {
  const text = role === 'supply' ? (live ? 'ENERGISED' : 'SUPPLY SIDE') : role === 'short' ? 'SHORTED' : 'OPEN';
  const cls = live && role !== 'open' ? 'fill-amber' : role === 'supply' ? 'fill-accent-soft' : 'fill-fg-muted';
  return (
    <g>
      <text x={x} y={y} textAnchor={anchor} className="fill-fg font-display text-[17px] font-bold tracking-[0.12em]">
        {name}
      </text>
      <text x={x} y={y + 13} textAnchor={anchor} className={cn('font-mono text-[9.5px]', cls)}>
        {text}
      </text>
    </g>
  );
}
