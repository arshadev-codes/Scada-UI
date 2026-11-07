import { useId, type CSSProperties } from 'react';
import { Panel } from '@/components/ui';
import { cn } from '@/lib/format';
import { ResultStamp } from '@/components/ui/ResultStamp';
import {
  PHASES,
  SUM_TOLERANCE,
  checkRound,
  type MbtResult,
  type MbtRound,
  type PhaseIndex,
} from './calculation';
import type { MbtStage } from './runMagneticBalanceTest';

const fmt = (n: number | undefined, d = 1) => (n === undefined || !Number.isFinite(n) ? '--' : n.toFixed(d));
const pct = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? '--' : `${(n * 100).toFixed(1)} %`);

const STAGE_LABEL: Partial<Record<MbtStage, string>> = {
  WAITING: 'Waiting for PLC',
  ENERGISED: 'Reading RY · YB · BR',
};

/** Entrance delay for the enter-* classes (index.css). */
const d = (s: number) => ({ '--d': `${s}s` }) as CSSProperties;

/** What each round should look like, in plain words. */
function expectation(e: PhaseIndex): string {
  const others = ([0, 1, 2] as const).filter((i) => i !== e).map((i) => PHASES[i]);
  return `${PHASES[e]} energised: ${others.join(' + ')} should add up to the applied ${PHASES[e]} voltage`;
}

// ── Step strip ──────────────────────────────────────────────────────────────

/** Round strip for the Sequence panel. Finished rounds can be clicked to view. */
export function MagneticBalanceSteps({
  round,
  stage,
  rounds,
  result,
  viewing,
  onView,
}: {
  round: PhaseIndex | null;
  stage: MbtStage | null;
  rounds: Array<MbtRound | undefined>;
  result: MbtResult | null;
  viewing: PhaseIndex | null;
  onView: (p: PhaseIndex) => void;
}) {
  const running = stage !== null && stage !== 'DONE' && stage !== 'ABORTED';
  // The PLC picks the order; while waiting, the next round is the first one not done yet.
  const next = ([0, 1, 2] as const).find((p) => !rounds[p]) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {([0, 1, 2] as const).map((p) => {
          const done = !!rounds[p];
          const active = running && (stage === 'ENERGISED' ? round === p : next === p);
          const failedHere = stage === 'ABORTED' && !done && next === p;
          const check = done ? checkRound(rounds[p]!) : null;
          const others = ([0, 1, 2] as const).filter((i) => i !== p);
          return (
            <li key={p}>
              <button
                type="button"
                disabled={!done || running}
                onClick={() => onView(p)}
                className={cn(
                  'w-full border px-3 py-2 text-left transition-colors',
                  active
                    ? 'border-amber bg-amber/[0.06] text-amber'
                    : failedHere
                      ? 'border-fault/70 text-fault'
                      : done
                        ? check?.pass
                          ? 'border-ok/60 text-ok hover:bg-ok/[0.05]'
                          : 'border-fault/60 text-fault hover:bg-fault/[0.05]'
                        : 'border-line text-fg-dim',
                  viewing === p && !running && 'ring-1 ring-accent',
                )}
              >
                <div className="num flex items-center justify-between text-[13px]">
                  <span>ROUND {p + 1}</span>
                  {done && <span>{check?.pass ? 'OK' : 'CHECK'}</span>}
                </div>
                <div className="label-tech text-[13px]">Energise {PHASES[p]}</div>
                <div className="num mt-1 truncate text-[13px] text-fg-dim">
                  {active
                    ? (STAGE_LABEL[stage!] ?? '…')
                    : done && check
                      ? others.map((i) => `${PHASES[i]} ${(check.share[i] * 100).toFixed(0)}%`).join(' · ')
                      : `Read ${others.map((i) => PHASES[i]).join(' + ')}`}
                </div>
              </button>
            </li>
          );
        })}
        <li
          className={cn(
            'border px-3 py-2',
            result ? (result.pass ? 'border-ok/60 text-ok' : 'border-fault/60 text-fault') : 'border-line text-fg-dim',
          )}
        >
          <div className="num text-[13px]">4</div>
          <div className="label-tech text-[13px]">Evaluate</div>
          <div className="num mt-1 text-[13px] text-fg-dim">{result ? (result.pass ? 'BALANCED' : 'NOT BALANCED') : 'Compare shares'}</div>
        </li>
      </ol>
      {stage === 'ABORTED' && <div className="label-tech text-[13px] text-fault">Test stopped · TEST STOP sent to PLC</div>}
    </div>
  );
}

// ── Core visual ─────────────────────────────────────────────────────────────

// Geometry (viewBox 640 × 384)
const LIMB_X = [170, 320, 470] as const;
const LIMB_W = 30;
const YOKE = { top: 72, bottom: 262, h: 26 } as const;
const COIL = { y: 112, h: 136, w: 72 } as const;
const SRC_Y = 34;
const PHASE_COLOR = ['var(--color-phase-r)', 'var(--color-phase-y)', 'var(--color-phase-b)'];

/**
 * Front view of the 3-limb core during one round.
 *   - Energised limb: amber coil with an AC source.
 *   - Flux goes up the energised limb, splits over the yoke and comes back
 *     down the other two limbs. Loop thickness = that limb's share.
 *   - The other limbs have a voltmeter: what it reads is the induced voltage.
 */
export function MagneticBalanceCore({
  energised,
  v,
  appliedSet,
  live,
  prefix,
}: {
  /** Limb being energised (or shown), null before the first round */
  energised: PhaseIndex | null;
  /** U, V, W voltages: live or the round's average */
  v: [number, number, number] | null;
  appliedSet: number;
  /** Voltage is on right now: animate the flux */
  live: boolean;
  /** Terminal prefix, "1" for HV and "2" for LV */
  prefix: string;
}) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${uid}-${n}`;

  const e = energised;
  const applied = e !== null && v ? v[e] : 0;
  const share = (i: number) => (v && applied > 1 ? Math.min(1.2, v[i] / applied) : 0);
  const hasData = e !== null && v !== null && applied > 1;
  const receivers = e === null ? [] : ([0, 1, 2] as const).filter((i) => i !== e);
  const sum = receivers.reduce<number>((s, i) => s + share(i), 0);

  const yT = YOKE.top + YOKE.h / 2;
  const yB = YOKE.bottom + YOKE.h / 2;

  /** Closed flux loop: up the energised limb, over the top yoke, down limb r, back along the bottom. */
  const loop = (r: number) => {
    const xe = LIMB_X[e!];
    const dir = Math.sign(r - e!);
    const far = Math.abs(r - e!) === 2;
    const xE = xe + dir * (far ? -6 : 6);
    const top = yT + (far ? -6 : 5);
    const bot = yB + (far ? 6 : -5);
    return `M${xE} ${bot} V${top} H${LIMB_X[r]} V${bot} Z`;
  };

  return (
    <figure className={cn('relative', live && 'hum')}>
      <svg
        viewBox="0 0 640 384"
        className="h-auto w-full"
        role="img"
        aria-label={
          e === null
            ? 'Three-limb core, not energised'
            : `Phase ${PHASES[e]} energised at ${fmt(applied)} volts. ${receivers
                .map((i) => `${PHASES[i]} reads ${fmt(v?.[i])} volts, ${pct(share(i))}`)
                .join('. ')}.`
        }
      >
        <defs>
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
          {/* Coil "level" fills: applied = signal yellow, induced = blue */}
          {(
            [
              ['lvl-applied', 'var(--viz-amber-soft)', 'var(--viz-amber)'],
              ['lvl-induced', '#5eead4', '#0d9488'],
            ] as const
          ).map(([name, top, bottom]) => (
            <linearGradient key={name} id={id(name)} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={top} stopOpacity="0.95" />
              <stop offset="1" stopColor={bottom} stopOpacity="0.9" />
            </linearGradient>
          ))}
          {LIMB_X.map((x, i) => (
            <clipPath key={x} id={id(`coil${i}`)}>
              <rect x={x - COIL.w / 2} y={COIL.y} width={COIL.w} height={COIL.h} rx="4" />
            </clipPath>
          ))}
          <radialGradient id={id('spot')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={live ? 'var(--viz-amber)' : 'var(--viz-violet)'} stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--viz-violet)" stopOpacity="0" />
          </radialGradient>
        </defs>


        {/* ── Core: bottom yoke, limbs grow up, top yoke drops on ── */}
        <g stroke={hasData ? 'var(--viz-fuchsia)' : 'var(--viz-idle-stroke)'} strokeWidth="1.1" fill="var(--viz-core)">
          <rect x={LIMB_X[0] - LIMB_W / 2 - 14} y={YOKE.bottom} width={LIMB_X[2] - LIMB_X[0] + LIMB_W + 28} height={YOKE.h} rx="3" className="enter-rise" style={d(0.05)} />
          {LIMB_X.map((x, k) => (
            <rect key={x} x={x - LIMB_W / 2} y={YOKE.top + YOKE.h} width={LIMB_W} height={YOKE.bottom - YOKE.top - YOKE.h} className="enter-grow" style={d(0.2 + k * 0.08)} />
          ))}
          <rect x={LIMB_X[0] - LIMB_W / 2 - 14} y={YOKE.top} width={LIMB_X[2] - LIMB_X[0] + LIMB_W + 28} height={YOKE.h} rx="3" className="enter-drop" style={d(0.5)} />
        </g>
        <g className="enter-fade" style={d(0.7)}>
          <text x={LIMB_X[0] - LIMB_W / 2 - 10} y={YOKE.top - 6} className="fill-fg-muted font-mono text-[9.5px]">
            TOP YOKE
          </text>
          <text x={LIMB_X[0] - LIMB_W / 2 - 10} y={YOKE.bottom + YOKE.h + 12} className="fill-fg-muted font-mono text-[9.5px]">
            BOTTOM YOKE
          </text>
        </g>

        {/* ── Coils ──────────────────────────────────────────── */}
        {LIMB_X.map((x, i) => {
          const isE = i === e;
          const s = share(i);
          const stroke = isE ? 'var(--viz-amber)' : hasData ? 'var(--viz-violet)' : 'var(--viz-idle-stroke)';
          // The coil fills from the bottom to the share of the applied voltage it carries.
          const level = hasData ? Math.min(1, isE ? 1 : s) : 0;
          const x0 = x - COIL.w / 2;
          const P = 36; // wave period
          const wave =
            `M${x0 - P} 0` + Array.from({ length: Math.ceil((COIL.w + 2 * P) / P) }, () => ` q${P / 4} -3.5 ${P / 2} 0 t${P / 2} 0`).join('') + ` V${COIL.h + 6} H${x0 - P} Z`;
          return (
            <g key={x} className="enter-drop" style={d(0.7 + i * 0.12)}>
              {/* empty coil */}
              <rect x={x0} y={COIL.y} width={COIL.w} height={COIL.h} rx="4" fill="var(--viz-idle-fill)" />
              {/* level: rises/falls smoothly, the surface ripples while the supply is on */}
              <g clipPath={`url(#${id(`coil${i}`)})`}>
                <g style={{ transform: `translateY(${COIL.y + COIL.h * (1 - level)}px)`, transition: 'transform 0.9s cubic-bezier(0.22, 1, 0.36, 1)' }}>
                  <g className={cn(live && 'wave-drift')}>
                    <path d={wave} fill={`url(#${id(isE ? 'lvl-applied' : 'lvl-induced')})`} />
                    <path d={wave.split(' V')[0]} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.2" />
                  </g>
                </g>
              </g>
              <rect x={x0} y={COIL.y} width={COIL.w} height={COIL.h} rx="4" fill={`url(#${id('stripes')})`} />
              <rect x={x - LIMB_W / 2} y={COIL.y} width={LIMB_W} height={COIL.h} fill="var(--viz-core)" fillOpacity="0.88" />
              {/* scale ticks at 25 / 50 / 75 % */}
              {[0.25, 0.5, 0.75].map((f) => (
                <line key={f} x1={x0 + COIL.w - 7} x2={x0 + COIL.w} y1={COIL.y + COIL.h * (1 - f)} y2={COIL.y + COIL.h * (1 - f)} stroke={stroke} strokeOpacity="0.8" />
              ))}
              <rect
                x={x0}
                y={COIL.y}
                width={COIL.w}
                height={COIL.h}
                rx="4"
                fill="none"
                stroke={stroke}
                strokeWidth={isE && live ? 2 : 1.4}
                className={cn(isE && live && 'pulse-soft')}
              />
            </g>
          );
        })}

        {/* ── Flux loops ─────────────────────────────────────── */}
        {hasData &&
          receivers.map((r) => (
            <g key={`${e}-${r}`} className="enter-fade">
              <path d={loop(r)} fill="none" stroke="var(--viz-fuchsia)" strokeOpacity="0.18" strokeWidth={2 + share(r) * 8} strokeLinejoin="round" />
              <path
                d={loop(r)}
                fill="none"
                stroke="var(--viz-fuchsia)"
                strokeWidth={1.2 + share(r) * 5}
                strokeLinejoin="round"
                strokeLinecap="round"
                className={cn(live && 'flow')}
                strokeDasharray={live ? undefined : '5 9'}
                filter={live ? `url(#${id('glow')})` : undefined}
              />
            </g>
          ))}
        {/* ── Labels on the coil faces, on top of the flux ───── */}
        {LIMB_X.map((x, i) => {
          const tone = i === e ? 'var(--viz-amber)' : 'var(--viz-fuchsia)';
          return (
            <g key={x} className="enter-fade" style={d(1.1)}>
              {hasData && (
                <>
                  <rect x={x - 30} y={COIL.y + 50} width="60" height="18" rx="2" fill="var(--viz-ink)" fillOpacity="0.9" stroke={tone} strokeWidth="0.8" />
                  <text x={x} y={COIL.y + 63} textAnchor="middle" className="font-mono text-[11.5px] font-bold" fill={tone}>
                    Φ {i === e ? '↑ 100' : `↓ ${(share(i) * 100).toFixed(0)}`} %
                  </text>
                </>
              )}
              <rect x={x - 14} y={COIL.y + COIL.h - 20} width="28" height="14" rx="2" fill="var(--viz-ink)" fillOpacity="0.9" />
              <text x={x} y={COIL.y + COIL.h - 10} textAnchor="middle" className="font-mono text-[10.5px] font-bold" fill={PHASE_COLOR[i]}>
                {prefix}
                {PHASES[i]}
              </text>
            </g>
          );
        })}

        {/* ── Instruments above each limb ────────────────────── */}
        {LIMB_X.map((x, i) => {
          const isE = i === e;
          const on = e !== null;
          const color = isE ? 'var(--viz-amber)' : on ? 'var(--viz-violet)' : 'var(--viz-idle-stroke)';
          return (
            <g key={x} className="enter-pop" style={d(1 + i * 0.1)}>
              {/* leads down to the coil, in front of the yoke */}
              <path
                d={`M${x - 9} ${SRC_Y + 9} L${x - 24} ${SRC_Y + 26} V${COIL.y} M${x + 9} ${SRC_Y + 9} L${x + 24} ${SRC_Y + 26} V${COIL.y}`}
                fill="none"
                stroke={color}
                strokeOpacity={on ? 0.9 : 0.4}
                strokeWidth="1.4"
                className={cn(isE && live && 'flow')}
              />
              <circle cx={x} cy={SRC_Y} r="13" fill="var(--viz-ink)" stroke={color} strokeWidth="1.6" filter={isE && live ? `url(#${id('glow')})` : undefined} />
              <text x={x} y={SRC_Y + 4} textAnchor="middle" className="font-mono text-[13.5px] font-bold" fill={color}>
                {isE ? '~' : 'V'}
              </text>
              <text x={x + 20} y={SRC_Y - 4} className="font-mono text-[9.5px]" fill={color}>
                {isE ? 'SUPPLY' : on ? 'METER' : ''}
              </text>
              <text x={x + 20} y={SRC_Y + 7} className="fill-fg-muted font-mono text-[9.5px]">
                {isE ? `SET ${appliedSet} V` : ''}
              </text>
            </g>
          );
        })}

        {/* ── Readouts under each limb ───────────────────────── */}
        {LIMB_X.map((x, i) => {
          const isE = i === e;
          const s = share(i);
          return (
            <g key={x} className="enter-rise" style={d(1.2 + i * 0.1)}>
              <text x={x} y={318} textAnchor="middle" className={cn('font-mono text-[9.5px]', isE ? 'fill-amber' : 'fill-fg-muted')}>
                {e === null ? 'PHASE ' + PHASES[i] : isE ? 'APPLIED' : 'INDUCED'}
              </text>
              <text x={x} y={340} textAnchor="middle" className="fill-fg font-mono text-[18px] font-medium">
                {v ? fmt(v[i]) : '--'}
                <tspan className="fill-fg-dim text-[11.5px]"> V</tspan>
              </text>
              <rect x={x - 55} y={350} width="110" height="6" rx="1" fill="var(--viz-track)" />
              {hasData && (
                <rect
                  x={x - 55}
                  y={350}
                  width={110 * Math.min(1, s)}
                  height="6"
                  rx="1"
                  fill={isE ? 'var(--viz-amber)' : 'var(--viz-fuchsia)'}
                  style={{ transition: 'width 0.4s ease' }}
                />
              )}
              <text x={x} y={372} textAnchor="middle" className="fill-fg-muted font-mono text-[10.5px]">
                {hasData ? `${(s * 100).toFixed(1)} % of applied` : ''}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="svg-scan" aria-hidden />

      {/* The rule in one line */}
      <figcaption className="mt-2 flex flex-col items-center gap-1 text-center">
        {hasData ? (
          <>
            <span className="num text-[14px] text-fg">
              {receivers.map((r) => `${PHASES[r]} ${fmt(v![r])}`).join(' + ')} = {fmt(receivers.reduce<number>((s, r) => s + v![r], 0))} V
              <span className="text-fg-muted"> vs applied {PHASES[e!]} {fmt(applied)} V</span>
              <span className={cn('ml-2', Math.abs(sum - 1) <= SUM_TOLERANCE ? 'text-ok' : 'text-fault')}>
                Σ {(sum * 100).toFixed(1)} %
              </span>
            </span>
            <span className="num text-[13px] text-fg-dim">{expectation(e!)}</span>
          </>
        ) : (
          <span className="num text-[13px] text-fg-muted">
            One limb is energised at a time. Its flux returns through the other two limbs, which produces their voltages
          </span>
        )}
      </figcaption>
    </figure>
  );
}

// ── Result table ────────────────────────────────────────────────────────────

export function MagneticBalancePanel({
  rounds,
  result,
  prefix,
}: {
  rounds: Array<MbtRound | undefined>;
  result: MbtResult | null;
  prefix: string;
}) {
  return (
    <Panel tag="MBT-01" title="Magnetic Balance" bodyClassName="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="overflow-x-auto">
        <table className="num w-full min-w-[520px] text-[14px]">
          <thead className="text-fg-dim">
            <tr>
              <th className="py-1 text-left font-normal">Energised</th>
              {PHASES.map((p) => (
                <th key={p} className="py-1 text-right font-normal">
                  {prefix}
                  {p}
                </th>
              ))}
              <th className="py-1 text-right font-normal">Σ induced</th>
              <th className="py-1 pl-4 text-left font-normal">Check</th>
            </tr>
          </thead>
          <tbody className="text-fg">
            {([0, 1, 2] as const).map((e) => {
              const r = rounds[e];
              const c = r ? checkRound(r) : null;
              return (
                <tr key={e} className="border-t border-line">
                  <td className="py-2">
                    {prefix}
                    {PHASES[e]}
                  </td>
                  {([0, 1, 2] as const).map((i) => (
                    <td key={i} className={cn('py-2 text-right', i === e && 'text-amber')}>
                      <div>{c ? `${fmt(c.v[i])} V` : '--'}</div>
                      <div className="text-[13px] text-fg-dim">{c ? (i === e ? 'applied' : pct(c.share[i])) : ''}</div>
                    </td>
                  ))}
                  <td className={cn('py-2 text-right', c && (Math.abs(c.sum - 1) <= SUM_TOLERANCE ? 'text-ok' : 'text-fault'))}>
                    {c ? pct(c.sum) : '--'}
                  </td>
                  <td className="py-2 pl-4">
                    {c ? (
                      <>
                        <div className={c.pass ? 'text-ok' : 'text-fault'}>{c.pass ? 'OK' : 'CHECK'}</div>
                        <div className="text-[13px] text-fg-dim">{c.reason}</div>
                      </>
                    ) : (
                      <span className="text-fg-dim">waiting</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 border-line lg:border-l lg:pl-6">
        <div className="label-tech text-[13px] text-fg-dim">Result</div>
        {result ? (
          <ResultStamp pass={result.pass} />
        ) : (
          <div className="num text-[14px] text-fg-dim">Run all three rounds to see PASS / FAIL</div>
        )}
        <ul className="num mt-1 flex flex-col gap-1 text-[13px] text-fg-dim">
          <li>· Each round: the two other voltages add up to the energised one ±{SUM_TOLERANCE * 100} %</li>
          <li>· All three rounds (RY, YB, BR) must pass</li>
        </ul>
      </div>
    </Panel>
  );
}
