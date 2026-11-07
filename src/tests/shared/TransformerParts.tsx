/**
 * Realistic transformer pieces shared by the instrument test drawings
 * (Insulation Resistance, Voltage Ratio): tank with radiators, porcelain
 * bushings, test-lead cables and terminal sockets. All colours come from the
 * --viz-* theme variables, so they follow light and dark mode.
 */
import { motion } from 'framer-motion';

export type Pt = [number, number];

/** Gradients the pieces below refer to; put once inside the parent <svg>. */
export function TransformerDefs({ id }: { id: (n: string) => string }) {
  return (
    <defs>
      <linearGradient id={id('tank')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--viz-tank-1)" />
        <stop offset="0.5" stopColor="var(--viz-tank-2)" />
        <stop offset="1" stopColor="var(--viz-tank-3)" />
      </linearGradient>
      <linearGradient id={id('shed')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="var(--viz-shed-1)" />
        <stop offset="0.4" stopColor="var(--viz-shed-2)" />
        <stop offset="0.6" stopColor="var(--viz-shed-3)" />
        <stop offset="1" stopColor="var(--viz-shed-4)" />
      </linearGradient>
      <radialGradient id={id('stress')} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="var(--viz-amber)" stopOpacity="0.55" />
        <stop offset="1" stopColor="var(--viz-amber)" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/** Tank, cover, plinth and radiators on both sides. */
export function TransformerTank({ x, y, w, h, tankFill, label }: { x: number; y: number; w: number; h: number; tankFill: string; label?: string }) {
  return (
    <g>
      <rect x={x + 10} y={y + h} width={w - 20} height={12} rx={2} fill="var(--viz-base)" stroke="var(--viz-metal)" strokeWidth="0.8" />
      {[x - 36, x + w + 8].map((x0) => (
        <g key={x0}>
          {Array.from({ length: 6 }, (_, k) => (
            <rect key={k} x={x0 + k * 4.6} y={y + 14} width={3} height={h - 28} rx={1.2} fill="var(--viz-radiator)" stroke="var(--viz-metal)" strokeWidth="0.6" />
          ))}
          <rect x={x0 - 1} y={y + 10} width={30} height={4} fill="var(--viz-metal)" />
          <rect x={x0 - 1} y={y + h - 14} width={30} height={4} fill="var(--viz-metal)" />
        </g>
      ))}
      <rect x={x} y={y} width={w} height={h} rx={10} fill={tankFill} stroke="var(--viz-wire)" strokeWidth="2" />
      <rect x={x - 10} y={y - 14} width={w + 20} height={14} rx={3} fill="var(--viz-cover)" stroke="var(--viz-wire)" strokeWidth="1.4" />
      {Array.from({ length: Math.floor(w / 50) }, (_, k) => (
        <line key={k} x1={x + 30 + k * 50} x2={x + 30 + k * 50} y1={y + 12} y2={y + h - 12} stroke="var(--viz-metal)" strokeOpacity="0.35" strokeWidth="1.2" />
      ))}
      {label && (
        <text x={x + w / 2} y={y + h - 14} textAnchor="middle" className="fill-fg-muted font-mono text-[12px]">
          {label}
        </text>
      )}
    </g>
  );
}

/** Porcelain bushing with sheds and a terminal stud on top. */
export function Bushing({ x, top, base, width, sheds, shed, label, hot }: { x: number; top: number; base: number; width: number; sheds: number; shed: string; label: string; hot: boolean }) {
  const h = base - top - 10;
  const step = h / sheds;
  return (
    <g>
      <rect x={x - 3} y={top - 8} width={6} height={14} rx={2} fill={hot ? 'var(--viz-amber)' : 'var(--viz-copper)'} />
      {Array.from({ length: sheds }, (_, k) => {
        const w = width - (k % 2) * 6;
        return <rect key={k} x={x - w / 2} y={top + 6 + k * step} width={w} height={step - 2} rx={step / 2.4} fill={`url(#${shed})`} stroke="var(--viz-shed-1)" strokeWidth="0.6" />;
      })}
      <rect x={x - width / 2 - 2} y={base - 6} width={width + 4} height={8} rx={2} fill="var(--viz-metal)" />
      <text x={x} y={base + 20} textAnchor="middle" className="fill-fg-dim font-mono text-[11px]">
        {label}
      </text>
    </g>
  );
}

export function EarthSymbol({ x, y }: { x: number; y: number }) {
  return (
    <g stroke="var(--viz-tick-major)" strokeWidth="2.2">
      {[16, 10, 4].map((w, k) => (
        <line key={w} x1={x - w} x2={x + w} y1={y + k * 5} y2={y + k * 5} />
      ))}
    </g>
  );
}

/** Instrument terminal socket with a sign and a label. */
export function Jack({ at, color, sign, label, labelBelow }: { at: Pt; color: string; sign: string; label: string; labelBelow?: boolean }) {
  return (
    <g>
      <circle cx={at[0]} cy={at[1]} r={13} fill="var(--viz-track)" stroke={color} strokeWidth="3" />
      <circle cx={at[0]} cy={at[1]} r={4.5} fill="var(--viz-metal)" />
      {labelBelow ? (
        <>
          <text x={at[0]} y={at[1] + 30} textAnchor="middle" className="fill-fg font-mono text-[13px] font-bold">
            {sign}
          </text>
          <text x={at[0]} y={at[1] + 45} textAnchor="middle" className="fill-fg-dim font-mono text-[10.5px]">
            {label}
          </text>
        </>
      ) : (
        <>
          <text x={at[0] + 20} y={at[1] - 1} className="fill-fg font-mono text-[15px] font-bold">
            {sign}
          </text>
          <text x={at[0] + 20} y={at[1] + 14} className="fill-fg-dim font-mono text-[11px]">
            {label}
          </text>
        </>
      )}
    </g>
  );
}

/** Test lead: thick insulated cable with a highlight; current flows along it while live. */
export function Cable({ d, color, live, morph, width = 6 }: { d: string; color: string; live: boolean; morph?: object; width?: number }) {
  return (
    <g>
      <motion.path d={d} animate={{ d }} transition={morph} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" />
      <motion.path d={d} animate={{ d }} transition={morph} fill="none" stroke="#ffffff" strokeOpacity="0.2" strokeWidth={width / 3.5} strokeLinecap="round" />
      {live && <motion.path d={d} animate={{ d }} transition={morph} fill="none" stroke="var(--viz-amber)" strokeWidth={width / 3} className="flow" />}
    </g>
  );
}
