/**
 * Bench drawing shared by the high-voltage and heat-run tests (Induced
 * Overvoltage, Applied Voltage, Temperature Rise): the source rack on the left
 * (mains → optional frequency converter → variac → optional step-up set) and
 * the load-loss transformer on the right, fed on its HV box.
 *
 * viewBox 1240 × 480. The load-loss frame (720 × 360) is drawn at XF.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/format';
import { Rotor } from './Rotor';
import { LL } from './LoadLossTransformer';
import type { Pt } from './TransformerParts';
import { Flow, rounded } from './Wiring';

export const BENCH = { w: 1240, h: 480 };
/** Where the load-loss frame sits in the bench. */
export const XF = { x: 380, y: 40, s: 1.18 };
export const at = (x: number, y: number): Pt => [XF.x + x * XF.s, XF.y + y * XF.s];

const HV_IN: Pt = at(LL.BOX_HV.x, LL.BOX_HV.y + LL.BOX_HV.h / 2);
export const RACK = {
  variac: { cx: 112, cy: 206, r: 66 },
  stepUp: { cx: 284, cy: 206 },
  mains: { x: 40, y: 404, w: 144, h: 58 },
  conv: { x: 204, y: 404, w: 152, h: 58 },
  busX: 360,
};

/** Colour of a conductor at a given stress (0 = normal live, 1 = fully over-stressed). */
export function stressColor(stress: number): string {
  if (stress <= 0) return 'var(--viz-amber)';
  const k = Math.min(1, stress);
  return `color-mix(in oklab, var(--viz-amber) ${Math.round((1 - k) * 100)}%, var(--color-fault))`;
}

/**
 * Mains → (frequency converter) → variac → (step-up) → cable to the HV box.
 * `frac` is the variac brush position 0…1.
 */
export function SourceRack({
  frac,
  live,
  stress = 0,
  variacV,
  converterHz,
  stepUp,
  ct,
  mainsHz,
}: {
  frac: number;
  live: boolean;
  /** 0…1, turns the output conductors red as the transformer is over-stressed */
  stress?: number;
  variacV: number;
  /** Shown when the test needs a raised frequency (induced overvoltage) */
  converterHz?: number;
  /** Step-up test transformer, e.g. { title: 'STEP-UP', ratio: '0.415 / 33 kV' } */
  stepUp?: { title: string; ratio: string };
  /** Current transformer on the output, with its reading (heat run) */
  ct?: string;
  mainsHz: number;
}) {
  const reduce = useReducedMotion();
  const { variac: V, stepUp: S, mains: M, conv: C } = RACK;
  const outColor = stressColor(stress);

  // mains → (converter) → variac bottom terminal
  const feed: Pt[] = converterHz
    ? [
        [M.x + M.w, M.y + M.h / 2],
        [C.x, C.y + M.h / 2],
      ]
    : [];
  const toVariac: Pt[] = converterHz
    ? [
        [C.x + C.w / 2, C.y],
        [C.x + C.w / 2, 344],
        [V.cx, 344],
        [V.cx, V.cy + V.r + 4],
      ]
    : [
        [V.cx, M.y],
        [V.cx, V.cy + V.r + 4],
      ];
  const variacOut: Pt = [V.cx + V.r + 8, V.cy];
  const out: Pt[] = stepUp
    ? [
        [S.cx + 46, S.cy],
        [RACK.busX, S.cy],
        [RACK.busX, HV_IN[1]],
        HV_IN,
      ]
    : [variacOut, [RACK.busX, V.cy], [RACK.busX, HV_IN[1]], HV_IN];
  const toStepUp: Pt[] = [variacOut, [S.cx - 46, S.cy]];

  const dFeed = feed.length ? rounded(feed) : '';
  const dToVariac = rounded(toVariac);
  const dOut = rounded(out, 14);
  const dToStep = rounded(toStepUp);
  const wire = (d: string, color: string, on: boolean, w = 3.4) => (
    <g>
      <path d={d} fill="none" stroke="var(--viz-ink)" strokeWidth={w + 3} strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke={on ? color : 'var(--viz-wire)'} strokeWidth={w} strokeOpacity={on ? 0.95 : 0.8} strokeLinejoin="round" strokeLinecap="round" />
    </g>
  );

  return (
    <g>
      {/* cables */}
      {dFeed && wire(dFeed, 'var(--viz-amber)', live)}
      {wire(dToVariac, 'var(--viz-amber)', live)}
      {stepUp && wire(dToStep, 'var(--viz-amber)', live && frac > 0.005)}
      {wire(dOut, outColor, live && frac > 0.005, stepUp ? 4.4 : 3.4)}
      {live && !reduce && (
        <>
          {dFeed && <Flow d={dFeed} fwd color="var(--viz-amber-soft)" size={2.6} gap={22} />}
          <Flow d={dToVariac} fwd color="var(--viz-amber-soft)" size={2.6} gap={22} />
          {frac > 0.005 && stepUp && <Flow d={dToStep} fwd color="var(--viz-amber-soft)" size={2.6} gap={22} />}
          {frac > 0.005 && <Flow d={dOut} fwd color={stress > 0 ? '#fff1e0' : 'var(--viz-amber-soft)'} size={stepUp ? 3.4 : 2.8} gap={stress > 0.3 ? 16 : 24} speed={stress > 0.3 ? 0.3 : 0.55} />}
        </>
      )}

      {/* mains incomer */}
      <g>
        <rect x={M.x} y={M.y} width={M.w} height={M.h} rx={7} fill="var(--viz-box)" stroke={live ? 'var(--viz-amber)' : 'var(--viz-metal)'} strokeWidth="1.5" />
        <circle cx={M.x + 18} cy={M.y + 18} r={5.5} fill={live ? 'var(--color-ok)' : 'var(--viz-tick-minor)'} />
        {live && <circle cx={M.x + 18} cy={M.y + 18} r={9} fill="var(--color-ok)" opacity="0.25" />}
        <text x={M.x + 32} y={M.y + 22} className={cn('font-display text-[11px] font-bold tracking-[0.14em]', live ? 'fill-amber' : 'fill-accent-soft')}>
          MAINS
        </text>
        <text x={M.x + 14} y={M.y + 44} className="fill-fg font-mono text-[13px]">
          415 V · {mainsHz} Hz
        </text>
      </g>

      {/* frequency converter (motor-generator) */}
      {converterHz && <Converter hz={converterHz} live={live} />}

      <VariacDisc frac={frac} live={live} volts={variacV} />

      {stepUp && <StepUp title={stepUp.title} ratio={stepUp.ratio} live={live && frac > 0.005} stress={stress} />}

      {ct && (
        <g>
          <ellipse cx={(variacOut[0] + RACK.busX) / 2} cy={V.cy} rx={9} ry={17} fill="none" stroke="var(--viz-metal)" strokeWidth="5" />
          <ellipse cx={(variacOut[0] + RACK.busX) / 2} cy={V.cy} rx={9} ry={17} fill="none" stroke={live ? 'var(--viz-copper)' : 'var(--viz-stem)'} strokeWidth="2" />
          <text x={(variacOut[0] + RACK.busX) / 2} y={V.cy + 34} textAnchor="middle" className="fill-fg-muted font-mono text-[9.5px]">
            CT
          </text>
          <text x={(variacOut[0] + RACK.busX) / 2} y={V.cy + 48} textAnchor="middle" className={cn('font-mono text-[12px] font-semibold', live ? 'fill-amber' : 'fill-fg-dim')}>
            {ct}
          </text>
        </g>
      )}
    </g>
  );
}

/** Toroidal variac seen from the front: copper toroid, scale, carbon-brush arm turned by the knob. */
function VariacDisc({ frac, live, volts }: { frac: number; live: boolean; volts: number }) {
  const { cx, cy, r } = RACK.variac;
  const reduce = useReducedMotion();
  const angle = -135 + 270 * Math.max(0, Math.min(1, frac));
  const pol = (deg: number, rr: number): Pt => [cx + rr * Math.sin((deg * Math.PI) / 180), cy - rr * Math.cos((deg * Math.PI) / 180)];
  const energised = live && frac > 0.005;
  return (
    <g>
      <circle cx={cx + 3} cy={cy + 5} r={r + 20} fill="#000" fillOpacity="0.18" />
      <circle cx={cx} cy={cy} r={r + 20} fill="var(--viz-box)" stroke={energised ? 'var(--viz-amber)' : 'var(--viz-metal)'} strokeWidth="1.6" />
      {/* scale */}
      {Array.from({ length: 28 }, (_, i) => {
        const f = i / 27;
        const deg = -135 + 270 * f;
        const major = i % 9 === 0 || i === 27;
        const [x1, y1] = pol(deg, r + 9);
        const [x2, y2] = pol(deg, r + (major ? 17 : 13));
        const lit = energised && f <= frac;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={lit ? 'var(--viz-amber)' : 'var(--viz-tick-minor)'} strokeWidth={major ? 1.8 : 1.1} />;
      })}
      {/* toroid with its turns */}
      <circle cx={cx} cy={cy} r={r - 4} fill="none" stroke="var(--viz-copper)" strokeWidth="15" strokeOpacity={energised ? 1 : 0.75} />
      {Array.from({ length: 64 }, (_, i) => {
        const deg = (360 / 64) * i;
        const [x1, y1] = pol(deg, r - 11);
        const [x2, y2] = pol(deg, r + 3);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--viz-ink)" strokeOpacity="0.45" strokeWidth="0.9" />;
      })}
      <circle cx={cx} cy={cy} r={r - 13} fill="var(--viz-track)" stroke="var(--viz-stem)" />
      {/* brush arm + knob */}
      <Rotor angle={angle} cx={cx} cy={cy} stiffness={40} damping={14}>
        <rect x={cx - 3} y={cy - r + 4} width={6} height={r - 6} rx={2} fill="var(--viz-metal)" />
        <rect x={cx - 7} y={cy - r - 2} width={14} height={11} rx={2} fill="#2a2a2a" stroke={energised ? 'var(--viz-amber)' : 'var(--viz-stem)'} />
        {energised && !reduce && (
          <motion.circle cx={cx} cy={cy - r + 2} r={6} fill="var(--viz-amber)" animate={{ opacity: [0.9, 0.25, 0.9], r: [5, 8, 5] }} transition={{ duration: 0.35, repeat: Infinity }} />
        )}
        <circle cx={cx} cy={cy} r={21} fill="var(--viz-metal)" stroke="var(--viz-ink)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={15} fill="var(--viz-stem)" />
        <rect x={cx - 2} y={cy - 19} width={4} height={13} rx={1.5} fill={energised ? 'var(--viz-amber)' : 'var(--viz-tick-major)'} />
      </Rotor>
      {[0, 0.5, 1].map((f) => {
        const [tx, ty] = pol(-135 + 270 * f, r + 29);
        return (
          <text key={f} x={tx} y={ty + 3} textAnchor="middle" className="fill-fg-dim font-mono text-[9.5px]">
            {Math.round(f * 100)}%
          </text>
        );
      })}
      <text x={cx} y={cy + r + 36} textAnchor="middle" className={cn('font-display text-[11px] font-bold tracking-[0.14em]', energised ? 'fill-amber' : 'fill-accent-soft')}>
        VARIAC
      </text>
      <text x={cx} y={cy + r + 52} textAnchor="middle" className="fill-fg font-mono text-[12px]">
        {Math.round(volts)} V · {Math.round(frac * 100)}%
      </text>
    </g>
  );
}

/** Two-winding step-up test transformer symbol. */
function StepUp({ title, ratio, live, stress }: { title: string; ratio: string; live: boolean; stress: number }) {
  const { cx, cy } = RACK.stepUp;
  return (
    <g>
      <rect x={cx - 50} y={cy - 46} width={100} height={92} rx={10} fill="var(--viz-box)" stroke={live ? stressColor(stress) : 'var(--viz-metal)'} strokeWidth="1.5" />
      <circle cx={cx - 13} cy={cy} r={22} fill="none" stroke={live ? 'var(--viz-amber)' : 'var(--viz-idle-stroke)'} strokeWidth="2.4" />
      <circle cx={cx + 13} cy={cy} r={22} fill="none" stroke={live ? stressColor(stress) : 'var(--viz-idle-stroke)'} strokeWidth="2.4" className={cn(live && 'pulse-soft')} />
      <text x={cx} y={cy - 30} textAnchor="middle" className="fill-fg-muted font-mono text-[8.5px]">
        LV
      </text>
      <text x={cx} y={cy + 64} textAnchor="middle" className={cn('font-display text-[11px] font-bold tracking-[0.12em]', live ? 'fill-amber' : 'fill-accent-soft')}>
        {title}
      </text>
      <text x={cx} y={cy + 79} textAnchor="middle" className="fill-fg-dim font-mono text-[10px]">
        {ratio}
      </text>
    </g>
  );
}

function Converter({ hz, live }: { hz: number; live: boolean }) {
  const { x, y, w, h } = RACK.conv;
  const reduce = useReducedMotion();
  const fx = x + w - 26;
  const fy = y + h / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={7} fill="var(--viz-box)" stroke={live ? 'var(--viz-amber)' : 'var(--viz-metal)'} strokeWidth="1.5" />
      <text x={x + 12} y={y + 20} className={cn('font-display text-[10.5px] font-bold tracking-[0.12em]', live ? 'fill-amber' : 'fill-accent-soft')}>
        CONVERTER
      </text>
      <text x={x + 12} y={y + 44} className="fill-fg font-mono text-[14px] font-semibold">
        {hz} Hz
      </text>
      <circle cx={fx} cy={fy} r={16} fill="var(--viz-track)" stroke="var(--viz-stem)" />
      <motion.g
        animate={live && !reduce ? { rotate: 360 } : { rotate: 0 }}
        transition={live ? { duration: 0.5, repeat: Infinity, ease: 'linear' } : { duration: 0.6 }}
      >
        {/* symmetric box so the group turns about the hub */}
        <circle cx={fx} cy={fy} r={14} fill="transparent" />
        {[0, 120, 240].map((a) => (
          <path key={a} d={`M${fx} ${fy} L${fx + 13 * Math.sin((a * Math.PI) / 180)} ${fy - 13 * Math.cos((a * Math.PI) / 180)}`} stroke={live ? 'var(--viz-amber)' : 'var(--viz-idle-stroke)'} strokeWidth="4" strokeLinecap="round" />
        ))}
      </motion.g>
      <circle cx={fx} cy={fy} r={3.5} fill="var(--viz-metal)" />
    </g>
  );
}

/**
 * A small electric arc between two points: a jagged line that re-strikes at
 * random, flickers, and sometimes misses a beat. `intensity` 0…1.
 */
export function Spark({ a, b, active, intensity = 1, color = '#cfe6ff', amp = 5, width = 1.6 }: { a: Pt; b: Pt; active: boolean; intensity?: number; color?: string; amp?: number; width?: number }) {
  const reduce = useReducedMotion();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active || reduce) return;
    let to: ReturnType<typeof setTimeout>;
    const loop = () => {
      setTick((t) => t + 1);
      to = setTimeout(loop, 55 + Math.random() * (320 - 200 * Math.min(1, intensity)));
    };
    loop();
    return () => clearTimeout(to);
  }, [active, intensity, reduce]);
  if (!active || reduce) return null;
  if (Math.random() > 0.3 + 0.6 * Math.min(1, intensity)) return null;
  const n = 7;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const pts = Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n;
    const off = k === 0 || k === n ? 0 : (Math.random() * 2 - 1) * amp;
    return `${(a[0] + dx * t + px * off).toFixed(1)},${(a[1] + dy * t + py * off).toFixed(1)}`;
  }).join(' ');
  return (
    <g pointerEvents="none">
      <polyline points={pts} fill="none" stroke={color} strokeOpacity="0.55" strokeWidth={width * 3.5} strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={pts} fill="none" stroke="var(--viz-spark-core)" strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={b[0]} cy={b[1]} r={width * 2.2} fill={color} opacity="0.7" />
    </g>
  );
}

/** Shorting link across bushing studs (copper bar with a label). */
export function ShortingLink({ xs, y, label, earth }: { xs: number[]; y: number; label: string; earth?: boolean }) {
  const x0 = Math.min(...xs) - 8;
  const x1 = Math.max(...xs) + 8;
  return (
    <g>
      {xs.map((x) => (
        <line key={x} x1={x} x2={x} y1={y} y2={y + 12} stroke="var(--viz-copper)" strokeWidth="2.4" />
      ))}
      <rect x={x0} y={y - 3} width={x1 - x0} height={6} rx={2} fill="var(--viz-copper)" stroke="var(--viz-ink)" strokeWidth="0.8" />
      <text x={(x0 + x1) / 2} y={y - 8} textAnchor="middle" className={cn('font-mono text-[8.5px] font-semibold', earth ? 'fill-ok' : 'fill-fg-muted')}>
        {label}
      </text>
    </g>
  );
}
