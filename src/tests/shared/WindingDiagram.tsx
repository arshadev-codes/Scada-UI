/**
 * A transformer winding drawn the way it is connected: delta triangle, star
 * (with or without neutral) or one single-phase coil. Coils are drawn as the
 * usual row of humps. Used inside a parent <svg>.
 */
import type { WindingInfo } from './transformer';

type Pt = [number, number];

export interface WindingGeometry {
  /** Terminal label → stud position */
  terminals: Record<string, Pt>;
  /** Coil ends, in phase order */
  coils: Array<[Pt, Pt]>;
  /** Star point, if any */
  star: Pt | null;
}

/** Labels: HV R Y B N, LV r y b n, single-phase 1.1 / 1.2 or 2.1 / 2.2. */
export function windingGeometry(
  info: WindingInfo,
  single: boolean,
  side: 'HV' | 'LV',
  cx: number,
  cy: number,
  s: number,
): WindingGeometry {
  const [a, b, c, n] = side === 'HV' ? ['R', 'Y', 'B', 'N'] : ['r', 'y', 'b', 'n'];
  if (single) {
    const p = side === 'HV' ? '1' : '2';
    const top: Pt = [cx, cy - s];
    const bot: Pt = [cx, cy + s];
    return { terminals: { [`${p}.1`]: [cx, cy - s - 18], [`${p}.2`]: [cx, cy + s + 18] }, coils: [[top, bot]], star: null };
  }
  const at = (deg: number, r: number): Pt => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const angles = [-90, 30, 150];
  if (info.connection === 'D') {
    const v = angles.map((d) => at(d, s));
    const t = angles.map((d) => at(d, s + 20));
    return {
      terminals: { [a]: t[0], [b]: t[1], [c]: t[2] },
      coils: [
        [v[0], v[1]],
        [v[1], v[2]],
        [v[2], v[0]],
      ],
      star: null,
    };
  }
  const ends = angles.map((d) => at(d, s));
  const t = angles.map((d) => at(d, s + 20));
  const terminals: Record<string, Pt> = { [a]: t[0], [b]: t[1], [c]: t[2] };
  if (info.neutral) terminals[n] = [cx, cy + s * 0.95];
  return { terminals, coils: ends.map((e) => [[cx, cy] as Pt, e]), star: [cx, cy] };
}

/** Path for a coil from p to q: straight leads with a row of humps in the middle. */
export function coilPath(p: Pt, q: Pt, humps = 5): string {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const lead = len * 0.2;
  const r = (len - 2 * lead) / (2 * humps);
  const pt = (d: number) => `${(p[0] + ux * d).toFixed(1)} ${(p[1] + uy * d).toFixed(1)}`;
  let d = `M${pt(0)} L${pt(lead)}`;
  for (let k = 1; k <= humps; k++) d += ` A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${pt(lead + 2 * r * k)}`;
  return `${d} L${pt(len)}`;
}

/** Terminals a meter is connected across for pair `i` (matches terminalPairs()). */
export function pairTerminals(info: WindingInfo, single: boolean, side: 'HV' | 'LV', i: number): [string, string] {
  const [a, b, c, n] = side === 'HV' ? ['R', 'Y', 'B', 'N'] : ['r', 'y', 'b', 'n'];
  if (single) return side === 'HV' ? ['1.1', '1.2'] : ['2.1', '2.2'];
  const l = [a, b, c];
  return info.neutral && info.connection !== 'D' ? [l[i], n] : [l[i], l[(i + 1) % 3]];
}

/** Coils carrying the meter current for pair `i`: main path, and the parallel path in a delta. */
export function pairCoils(info: WindingInfo, single: boolean, i: number): { main: number[]; parallel: number[] } {
  if (single) return { main: [0], parallel: [] };
  if (info.connection === 'D') return { main: [i], parallel: [(i + 1) % 3, (i + 2) % 3] };
  if (info.neutral) return { main: [i], parallel: [] };
  return { main: [i, (i + 1) % 3], parallel: [] };
}

export function WindingDiagram({
  geo,
  label,
  main = [],
  parallel = [],
  flowing,
  colors = ['var(--color-phase-r)', 'var(--color-phase-y)', 'var(--color-phase-b)'],
}: {
  geo: WindingGeometry;
  label: string;
  /** Coils lit as carrying current */
  main?: number[];
  parallel?: number[];
  /** Animate current flow on the lit coils */
  flowing: boolean;
  colors?: string[];
}) {
  const ys = Object.values(geo.terminals).map((t) => t[1]);
  const xs = Object.values(geo.terminals).map((t) => t[0]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  return (
    <g>
      {geo.coils.map(([p, q], i) => {
        const lit = main.includes(i);
        const half = parallel.includes(i);
        const d = coilPath(p, q);
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={lit || half ? colors[i % 3] : 'var(--viz-idle-stroke)'} strokeOpacity={lit ? 1 : half ? 0.55 : 0.6} strokeWidth={lit ? 2.6 : 1.8} strokeLinejoin="round" />
            {(lit || half) && flowing && (
              <path d={d} fill="none" stroke="var(--viz-amber)" strokeOpacity={lit ? 0.95 : 0.45} strokeWidth={lit ? 2 : 1.4} className="flow" />
            )}
          </g>
        );
      })}
      {geo.star && <circle cx={geo.star[0]} cy={geo.star[1]} r="3.5" fill="var(--viz-idle-stroke)" />}
      {/* terminal stubs + studs */}
      {Object.entries(geo.terminals).map(([name, [x, y]]) => {
        const from = name.toLowerCase() === 'n' && geo.star ? geo.star : nearestEnd(geo, [x, y]);
        return (
          <g key={name}>
            <line x1={from[0]} y1={from[1]} x2={x} y2={y} stroke="var(--viz-wire)" strokeWidth="1.6" />
            <circle cx={x} cy={y} r="5" fill="var(--viz-ink)" stroke="var(--viz-copper)" strokeWidth="2" />
            <text x={x + (x < cx ? -10 : 10)} y={y + 4} textAnchor={x < cx ? 'end' : 'start'} className="fill-fg font-mono text-[12.5px] font-semibold">
              {name}
            </text>
          </g>
        );
      })}
      <text x={cx} y={Math.max(...ys) + 30} textAnchor="middle" className="fill-fg-muted font-mono text-[11.5px]">
        {label}
      </text>
    </g>
  );
}

function nearestEnd(geo: WindingGeometry, t: Pt): Pt {
  let best: Pt = t;
  let bestD = Infinity;
  for (const [p, q] of geo.coils)
    for (const e of [p, q]) {
      if (geo.star && e[0] === geo.star[0] && e[1] === geo.star[1]) continue;
      const d = Math.hypot(e[0] - t[0], e[1] - t[1]);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
  return best;
}
