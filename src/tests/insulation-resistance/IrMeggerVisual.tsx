import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useId } from 'react';
import { cn } from '@/lib/format';
import type { TestObject } from '@/store/types';
import { Rotor } from '@/tests/shared/Rotor';
import { LL, LoadLossDefs, LoadLossTransformer, SupplyBox, bushingIdx, busRuns, type CoilState } from '@/tests/shared/LoadLossTransformer';
import { EarthSymbol, Jack, type Pt } from '@/tests/shared/TransformerParts';
import { parseVectorGroup } from '@/tests/shared/transformer';
import { Flow, rounded } from '@/tests/shared/Wiring';
import { DAI_MIN, IR_POINTS, PI_MIN, formatMohm, type IrPair } from './calculation';
import type { IrReading, irPlan } from './runInsulationTest';

type Plan = ReturnType<typeof irPlan>;

// ── Geometry (viewBox 1230 × 530) ──────────────────────────────────────────
/** The load-loss transformer frame (720 × 360), drawn 1.2× so it reads as large as on the load-loss screen. */
const XF = { x: -5, y: 40, s: 1.2 };
const at = (x: number, y: number): Pt => [XF.x + x * XF.s, XF.y + y * XF.s];
const box = (b: { x: number; y: number; w: number; h: number }) => {
  const [x0, y0] = at(b.x, b.y);
  const [x1, y1] = at(b.x + b.w, b.y + b.h);
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2 };
};
const HVB = box(LL.BOX_HV);
const LVB = box(LL.BOX_LV);
const TANK_FOOT: Pt = [at(588, 0)[0], at(0, 348)[1]];

const MEGGER = { x: 885, y: 60, w: 330, h: 360 };
const PLUS: Pt = [MEGGER.x + 82, MEGGER.y + 336];
const MINUS: Pt = [MEGGER.x + 248, MEGGER.y + 336];
/** Cable lanes: red LINE keeps to the inner lane, black EARTH to the outer one, so they never cross. */
const LANE = { lineX: MEGGER.x - 12, returnX: MEGGER.x - 24, lineY: PLUS[1] + 44, returnY: PLUS[1] + 60, top: 36 };
const EARTH = { y: 482, x0: 660, x1: 850, sym: 770 };

type Lead = { pts: Pt[]; badge: Pt };
const HV_TOP: Pt = [HVB.cx, HVB.y0];
const LV_LINE: Pt = [LVB.x1, LVB.y0 + 34];
const LV_RET: Pt = [LVB.x1, LVB.y0 + 62];
const LINE_LEAD: Record<'HV' | 'LV' | 'REST', Lead> = {
  HV: {
    pts: [PLUS, [PLUS[0], LANE.lineY], [LANE.lineX, LANE.lineY], [LANE.lineX, LANE.top], [HV_TOP[0], LANE.top], HV_TOP],
    badge: [HV_TOP[0] - 24, HV_TOP[1] - 16],
  },
  LV: { pts: [PLUS, [PLUS[0], LANE.lineY], [LANE.lineX, LANE.lineY], [LANE.lineX, LV_LINE[1]], LV_LINE], badge: [LV_LINE[0] + 11, LV_LINE[1] - 18] },
  REST: { pts: [PLUS, [PLUS[0], PLUS[1] + 62]], badge: [PLUS[0] - 24, PLUS[1] + 62] },
};
const RETURN_LEAD: Record<'LV' | 'EARTH' | 'REST', Lead> = {
  LV: { pts: [MINUS, [MINUS[0], LANE.returnY], [LANE.returnX, LANE.returnY], [LANE.returnX, LV_RET[1]], LV_RET], badge: [LVB.x1 - 14, LVB.y1 + 17] },
  EARTH: { pts: [MINUS, [MINUS[0], EARTH.y], [EARTH.x1, EARTH.y]], badge: [EARTH.x1 + 14, EARTH.y - 19] },
  REST: { pts: [MINUS, [MINUS[0], MINUS[1] + 62]], badge: [MINUS[0] + 24, MINUS[1] + 62] },
};
/** Green/yellow earth straps: tank → earth bar, and the winding not under test → earth bar. */
const STRAP: Record<'TANK' | 'HV' | 'LV', Pt[]> = {
  TANK: [TANK_FOOT, [TANK_FOOT[0], EARTH.y]],
  LV: [
    [LVB.x1 - 12, LVB.y1],
    [LVB.x1 - 12, EARTH.y],
  ],
  HV: [
    [HVB.cx, HVB.y1],
    [HVB.cx, 512],
    [EARTH.x0 + 6, 512],
    [EARTH.x0 + 6, EARTH.y],
  ],
};

/** What each end of the transformer is connected to, per insulation under test. */
type Role = 'line' | 'return' | 'earthed' | 'idle';
const ROLES: Record<IrPair, { HV: Role; LV: Role }> = {
  'HV–LV': { HV: 'line', LV: 'return' },
  'HV–E': { HV: 'line', LV: 'earthed' },
  'LV–E': { HV: 'earthed', LV: 'line' },
};
const RED = { core: '#d92b20', edge: '#4a0b07', badge: '#d92b20', ink: '#fff' };
const BLACK = { core: '#1c1e22', edge: '#8c96a3', badge: '#f2f2f2', ink: '#111' };

// Megger bar graph: log 0.1 MΩ … 1 TΩ (mapped over 240°)
const LOG_MIN = -1;
const LOG_MAX = 6;
const dialAngle = (mohm: number) => -120 + 240 * Math.min(1, (Math.log10(Math.max(10 ** LOG_MIN, mohm)) - LOG_MIN) / (LOG_MAX - LOG_MIN));
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtR = (r: number | null | undefined) => {
  const f = formatMohm(r);
  return f.value === '—' ? '—' : `${f.value} ${f.unit}`;
};

/**
 * Insulation Resistance on the load-loss transformer drawing: HV bushings bussed
 * to the HV terminal box on the left end, LV bushings to the LV box on the right
 * end (each winding shorted), tank earthed to the earth bar. The megger's red
 * LINE (+) and black EARTH (−) leads run to the insulation under test — HV–LV,
 * HV–E or LV–E. When the pair changes the old lead pulls back into the megger and
 * the new one lays out to its terminal; while the test voltage is on, dots run
 * the whole circuit (out on +, through the bushings, back on −), and run back in
 * light blue while the winding discharges. The winding not under test is
 * strapped to earth; the stressed insulation glows in the cutaway.
 */
export function IrVisual({ o, plan, reading }: { o: TestObject; plan: Plan; reading: IrReading | null }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${uid}-${n}`;
  const reduce = !!useReducedMotion();
  const i = reading?.pairIndex ?? null;
  const pair = i !== null ? plan[i] : null;
  const live = !!pair && !reading?.discharging && (reading?.voltage ?? 0) > 1;
  const discharging = !!pair && !!reading?.discharging;
  const energised = live || discharging;
  const elapsed = reading?.elapsed ?? 0;
  const progress = Math.min(1, elapsed / 600);
  const r = reading?.r ?? 0;
  const vNow = reading?.voltage ?? 0;

  const vg = parseVectorGroup(o.vectorGroup);
  const single = o.phases === '1';
  const idx = { HV: bushingIdx(single, vg.hv.neutral), LV: bushingIdx(single, vg.lv.neutral) };
  const roles: { HV: Role; LV: Role } = pair ? ROLES[pair.pair] : { HV: 'idle', LV: 'idle' };
  const lineKey = !pair ? 'REST' : roles.HV === 'line' ? 'HV' : 'LV';
  const returnKey = !pair ? 'REST' : roles.LV === 'return' ? 'LV' : 'EARTH';
  const earthed = roles.HV === 'earthed' ? 'HV' : roles.LV === 'earthed' ? 'LV' : null;
  const toEarth = returnKey === 'EARTH';
  // leakage current: out of + into the line winding, back to − from the other winding (or via the tank)
  const flowColor = discharging ? '#bfe3ff' : 'var(--viz-amber)';
  const out = !discharging;
  const role = (side: 'HV' | 'LV') => {
    const rl = roles[side];
    return rl === 'line'
      ? { value: '+ LINE', note: discharging ? 'DISCHARGING' : `${Math.round(vNow)} V DC`, side: discharging ? 'LINE + · DISCHARGING' : `LINE + · ${Math.round(vNow)} V DC` }
      : rl === 'return'
        ? { value: '− EARTH', note: 'MEGGER RETURN', side: 'EARTH − · RETURN' }
        : rl === 'earthed'
          ? { value: 'EARTHED', note: 'STRAPPED TO EARTH', side: 'EARTHED' }
          : { value: 'OPEN', note: 'NOT CONNECTED', side: 'SHORTED · STANDBY' };
  };
  const coils = (side: 'HV' | 'LV'): CoilState[] =>
    [0, 1, 2].map(() => (!energised ? 'idle' : roles[side] === 'line' ? 'live' : roles[side] === 'return' ? 'induced' : 'idle'));

  const shownIdx = i ?? (reading ? [...reading.points.keys()].reverse().find((k) => reading.points[k].r600 != null) ?? null : null);
  const pts = shownIdx !== null ? reading?.points[shownIdx] : undefined;
  const dai = pts?.r15 && pts.r60 ? pts.r60 / pts.r15 : NaN;
  const pi = pts?.r60 && pts.r600 ? pts.r600 / pts.r60 : NaN;
  const ringR = 46;
  const ringC = 2 * Math.PI * ringR;

  return (
    <div className="flex flex-col gap-4">
      {/* pair + voltage + time */}
      <div className="flex flex-wrap items-center gap-3 rounded-[6px] border border-line bg-ink-800 px-4 py-2.5">
        <span className="font-display text-[15px] font-semibold text-fg">Insulation under test</span>
        {plan.map((p, k) => {
          const done = reading?.points[k]?.r600 != null;
          return (
            <span
              key={p.pair}
              className={cn(
                'num rounded-full border px-3 py-1 text-[14px] font-semibold',
                k === i ? 'border-amber text-amber' : done ? 'border-ok/60 text-ok' : 'border-line text-fg-dim',
              )}
            >
              {p.pair}
            </span>
          );
        })}
        <span className="num ml-auto text-[15px] text-fg-muted">
          {pair ? (
            <>
              <span className="font-semibold text-fg">{(reading?.voltage ?? 0).toFixed(0)}</span> / {pair.testV} V DC ·{' '}
              <span className="font-semibold text-fg">{mmss(Math.min(600, elapsed))}</span> / 10:00
              {reading && reading.speed > 1 && <span className="text-amber"> · demo ×{reading.speed}</span>}
            </>
          ) : (
            'No test voltage'
          )}
        </span>
      </div>

      <svg viewBox="0 0 1230 530" className="w-full rounded-[6px] border border-line bg-ink-850" role="img" aria-label={`Megger connected ${pair ? pair.pair : 'to nothing'}`}>
        <LoadLossDefs id={id} />

        {/* ── transformer, connected at both ends (as in load loss) ── */}
        <g transform={`translate(${XF.x} ${XF.y}) scale(${XF.s})`}>
          {(['HV', 'LV'] as const).map((side) => {
            const runs = busRuns(side, idx[side], single);
            const rl = roles[side];
            const onMegger = rl === 'line' || rl === 'return';
            const flowing = energised && onMegger && !reduce;
            // + side: current runs box → bushing; return side: bushing → box (reversed while discharging)
            const fwd = (rl === 'line') === out;
            const r0 = role(side);
            return (
              <g key={side}>
                {runs.map((run) => (
                  <g key={run.bi}>
                    <path d={run.d} fill="none" stroke={run.color} strokeOpacity={onMegger ? 1 : 0.7} strokeWidth={onMegger ? 2.8 : 2.2} strokeLinejoin="round" />
                    {flowing && <Flow d={run.d} fwd={fwd} color={flowColor} size={2.8} gap={24} delay={1} />}
                  </g>
                ))}
                <SupplyBox side={side} title={`${side} TERMINALS`} value={r0.value} unit="ALL SHORTED" live={energised && onMegger} runs={runs} note={r0.note} />
              </g>
            );
          })}
          <LoadLossTransformer
            id={id}
            single={single}
            hvIdx={idx.HV}
            lvIdx={idx.LV}
            hvCoils={coils('HV')}
            lvCoils={coils('LV')}
            hotHv={energised && roles.HV === 'line' ? idx.HV : []}
            hotLv={energised && roles.LV === 'line' ? idx.LV : []}
            live={energised}
            caption="TANK · EARTHED"
            hvRole={role('HV').side}
            lvRole={role('LV').side}
          >
            {pair && live && (
              <g>
                <ellipse cx={412} cy={262} rx={130} ry={52} fill={`url(#${id('ll-stress')})`} className="pulse-soft" />
                <text x={412} y={266} textAnchor="middle" className="fill-amber font-mono text-[12px] font-bold">
                  {pair.pair} insulation
                </text>
              </g>
            )}
          </LoadLossTransformer>
        </g>

        {/* ── earth bar: tank always strapped to it ── */}
        <Strap pts={STRAP.TANK} />
        <rect x={EARTH.x0} y={EARTH.y - 3.5} width={EARTH.x1 - EARTH.x0} height={7} rx={2} fill="var(--viz-copper)" stroke="#5a2d12" strokeWidth="0.8" />
        {[EARTH.x0 + 18, EARTH.x0 + 60, EARTH.x1 - 18].map((bx) => (
          <circle key={bx} cx={bx} cy={EARTH.y} r={2.2} fill="var(--viz-ink)" />
        ))}
        <text x={EARTH.sym + 22} y={EARTH.y + 22} className="fill-fg-muted font-mono text-[10px] font-semibold">
          EARTH BAR
        </text>
        <path d={`M${EARTH.sym} ${EARTH.y + 3} V${EARTH.y + 16}`} stroke="#2e9e4a" strokeWidth="3" />
        <EarthSymbol x={EARTH.sym} y={EARTH.y + 16} />
        {energised && toEarth && !reduce && (
          <>
            <Flow d={rounded(STRAP.TANK)} fwd={out} color={flowColor} delay={1} />
            <Flow d={`M${TANK_FOOT[0]} ${EARTH.y} H${EARTH.x1}`} fwd={out} color={flowColor} delay={1} />
          </>
        )}

        {/* winding not under test strapped to earth (green/yellow) */}
        <AnimatePresence>
          {earthed && (
            <motion.g key={earthed} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
              <Strap pts={STRAP[earthed]} />
              {earthed === 'LV' ? (
                <text x={LVB.x1 - 20} y={330} textAnchor="end" className="fill-ok font-mono text-[12px] font-bold">
                  LV EARTHED
                </text>
              ) : (
                <text x={HVB.cx + 10} y={330} className="fill-ok font-mono text-[12px] font-bold">
                  HV EARTHED
                </text>
              )}
            </motion.g>
          )}
        </AnimatePresence>

        {/* ── digital insulation tester ───────────────── */}
        <DigitalMegger
          x={MEGGER.x}
          y={MEGGER.y}
          w={MEGGER.w}
          h={MEGGER.h}
          live={live}
          r={live ? r : null}
          testV={pair?.testV ?? null}
          vNow={vNow}
          elapsed={elapsed}
          dai={dai}
          pi={pi}
          pairName={pair?.pair ?? null}
        />

        {/* ── megger leads: pull back, then lay out to the new pair's terminals ── */}
        <AnimatePresence mode="wait" initial={false}>
          <TestLead key={`line-${lineKey}`} lead={LINE_LEAD[lineKey]} c={RED} sign="+" flow={energised && !reduce} fwd={out} flowColor={flowColor} reduce={reduce} />
        </AnimatePresence>
        <AnimatePresence mode="wait" initial={false}>
          <TestLead key={`ret-${returnKey}`} lead={RETURN_LEAD[returnKey]} c={BLACK} sign="−" flow={energised && !reduce} fwd={!out} flowColor={flowColor} reduce={reduce} />
        </AnimatePresence>
        <Plug at={PLUS} c={RED} />
        <Plug at={MINUS} c={BLACK} />
      </svg>

      {/* ── time + readings ─────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex items-center gap-4 rounded-[6px] border border-line bg-ink-850 p-3">
          <svg viewBox="0 0 120 120" className="w-24 shrink-0" role="img" aria-label={`Elapsed ${mmss(elapsed)} of 10 minutes`}>
            <circle cx={60} cy={60} r={ringR} fill="none" stroke="var(--viz-track)" strokeWidth="10" />
            <motion.circle
              cx={60}
              cy={60}
              r={ringR}
              fill="none"
              stroke={live ? 'var(--viz-amber)' : 'var(--viz-tick-minor)'}
              strokeWidth="10"
              strokeDasharray={ringC}
              animate={{ strokeDashoffset: ringC * (1 - progress) }}
              transition={{ duration: 0.12 }}
              transform="rotate(-90 60 60)"
            />
            <text x={60} y={66} textAnchor="middle" className="fill-fg font-mono text-[18px] font-bold">
              {mmss(Math.min(600, elapsed))}
            </text>
          </svg>
          <div className="flex flex-col gap-1.5">
            {IR_POINTS.map((s) => {
              const got = pts?.[s === 15 ? 'r15' : s === 60 ? 'r60' : 'r600'] != null;
              return (
                <div key={s} className={cn('num flex items-center gap-2 text-[14px]', got ? 'font-semibold text-fg' : 'text-fg-dim')}>
                  <span className={cn('size-3 rounded-full border', got ? 'border-ok bg-ok' : 'border-fg-dim')} />
                  {s === 600 ? '10 min' : `${s} s`}
                </div>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line bg-line md:grid-cols-5">
          <Card label="R 15 s" value={fmtR(pts?.r15)} />
          <Card label="R 60 s" value={fmtR(pts?.r60)} />
          <Card label="R 10 min" value={fmtR(pts?.r600)} />
          <Card label={`DAI · min ${DAI_MIN}`} value={Number.isFinite(dai) ? dai.toFixed(2) : '—'} ok={Number.isFinite(dai) ? dai >= DAI_MIN : null} />
          <Card label={`PI · min ${PI_MIN}`} value={Number.isFinite(pi) ? pi.toFixed(2) : '—'} ok={Number.isFinite(pi) ? pi >= PI_MIN : null} />
        </div>
      </div>
    </div>
  );
}

type LeadColors = typeof RED;

/**
 * One megger test lead: insulated cable (outline, core, sheen) laid out from the
 * megger socket along its route, then a ring lug and a polarity badge at the
 * terminal. On exit it pulls back into the megger. While current flows, dots
 * run along it.
 */
function TestLead({ lead, c, sign, flow, fwd, flowColor, reduce }: { lead: Lead; c: LeadColors; sign: string; flow: boolean; fwd: boolean; flowColor: string; reduce: boolean }) {
  const d = rounded(lead.pts);
  const end = lead.pts[lead.pts.length - 1];
  const lay = { duration: reduce ? 0 : 0.95, ease: [0.65, 0, 0.35, 1] as const };
  const pull = { duration: reduce ? 0 : 0.45, ease: [0.55, 0, 1, 0.45] as const };
  const strand = (stroke: string, width: number, opacity = 1) => (
    <motion.path
      d={d}
      fill="none"
      stroke={stroke}
      strokeOpacity={opacity}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1, transition: lay }}
      exit={{ pathLength: 0, transition: pull }}
    />
  );
  return (
    <motion.g initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 1, transition: pull }}>
      {strand(c.edge, 8.5)}
      {strand(c.core, 5.6)}
      {strand('#ffffff', 1.3, 0.22)}
      {flow && <Flow d={d} fwd={fwd} color={flowColor} delay={reduce ? 0 : 1} />}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: reduce ? 0 : 0.85, duration: 0.2 } }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
        {/* ring lug on the terminal */}
        <circle cx={end[0]} cy={end[1]} r={8} fill={c.core} stroke={c.edge} strokeWidth="1.6" />
        <circle cx={end[0]} cy={end[1]} r={2.8} fill="var(--viz-ink)" />
        {/* polarity badge */}
        <circle cx={lead.badge[0]} cy={lead.badge[1]} r={10.5} fill={c.badge} stroke="#000" strokeWidth="1" />
        <text x={lead.badge[0]} y={lead.badge[1] + 5} textAnchor="middle" fill={c.ink} className="font-mono text-[15px] font-bold">
          {sign}
        </text>
      </motion.g>
    </motion.g>
  );
}

/** Lead plug sitting in a megger socket. */
function Plug({ at: p, c }: { at: Pt; c: LeadColors }) {
  return (
    <g>
      <circle cx={p[0]} cy={p[1]} r={8.5} fill={c.core} stroke={c.edge} strokeWidth="1.6" />
      <circle cx={p[0] - 2.5} cy={p[1] - 2.5} r={2.2} fill="#ffffff" fillOpacity="0.3" />
    </g>
  );
}

/** Green/yellow earth strap. */
function Strap({ pts }: { pts: Pt[] }) {
  const d = rounded(pts, 8);
  return (
    <g>
      <path d={d} fill="none" stroke="#2e9e4a" strokeWidth="3.5" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#e6c43a" strokeWidth="3.5" strokeDasharray="7 7" strokeLinejoin="round" />
    </g>
  );
}

function Card({ label, value, ok = null }: { label: string; value: string; ok?: boolean | null }) {
  return (
    <div className="bg-ink-850 px-4 py-3">
      <div className="num text-[13px] text-fg-muted">{label}</div>
      <div className={cn('num text-[26px] font-semibold leading-tight', ok === null ? 'text-fg' : ok ? 'text-ok' : 'text-fault')}>
        {value}
        {ok !== null && <span className="ml-2 text-[18px]">{ok ? '✓' : '✗'}</span>}
      </div>
    </div>
  );
}

/**
 * Insulation tester drawn in the app's own instrument style (same as the
 * speedometer gauges): navy case with a nameplate strip, semicircle dial on a
 * log scale 0.1 MΩ … 1 TΩ with a progress arc and needle, big reading, a
 * stat row (test V · time · DAI · PI), and + / G / − terminals.
 */
function DigitalMegger({
  x,
  y,
  w,
  h,
  live,
  r,
  testV,
  vNow,
  elapsed,
  dai,
  pi,
  pairName,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  live: boolean;
  r: number | null;
  testV: number | null;
  vNow: number;
  elapsed: number;
  dai: number;
  pi: number;
  pairName: string | null;
}) {
  const f = formatMohm(r);
  const frac = r ? (dialAngle(r) + 120) / 240 : 0; // 0 … 1 along the log scale
  const G = { cx: x + w / 2, cy: y + 168, r: 112 };
  const pt = (fr: number, rad: number): Pt => {
    const a = Math.PI - Math.PI * fr;
    return [G.cx + rad * Math.cos(a), G.cy - rad * Math.sin(a)];
  };
  const arc = (from: number, to: number, rad: number) => {
    const [x1, y1] = pt(from, rad);
    const [x2, y2] = pt(to, rad);
    return `M${x1} ${y1} A${rad} ${rad} 0 0 1 ${x2} ${y2}`;
  };
  const LABELS: Array<[number, string]> = [
    [0, '0.1M'],
    [2 / 7, '10M'],
    [4 / 7, '1G'],
    [6 / 7, '100G'],
    [1, '1T'],
  ];
  const stats: Array<[string, string, boolean | null]> = [
    ['TEST V', testV ? `${Math.round(vNow)}` : '—', null],
    ['TIME', mmss(Math.min(600, elapsed)), null],
    ['DAI', Number.isFinite(dai) ? dai.toFixed(2) : '—', Number.isFinite(dai) ? dai >= DAI_MIN : null],
    ['PI', Number.isFinite(pi) ? pi.toFixed(2) : '—', Number.isFinite(pi) ? pi >= PI_MIN : null],
  ];
  const cellW = (w - 28) / stats.length;

  return (
    <g>
      {/* case + nameplate */}
      <rect x={x} y={y} width={w} height={h} rx={10} fill="var(--viz-ink)" stroke={live ? 'var(--viz-amber)' : 'var(--viz-metal)'} strokeWidth="1.6" />
      <rect x={x} y={y} width={w} height={34} rx={10} fill="var(--color-plate)" />
      <rect x={x} y={y + 24} width={w} height={10} fill="var(--color-plate)" />
      <line x1={x} x2={x + w} y1={y + 34} y2={y + 34} stroke="var(--color-accent)" strokeWidth="2" />
      <text x={x + 14} y={y + 22} fill="var(--color-plate-fg)" className="font-display text-[13px] font-semibold tracking-[0.12em]">
        INSULATION TESTER
      </text>
      <circle cx={x + w - 70} cy={y + 17} r={5} fill={live ? 'var(--viz-amber)' : 'var(--viz-tick-minor)'} className={live ? 'pulse-soft' : undefined} />
      <text x={x + w - 14} y={y + 22} textAnchor="end" className={cn('font-mono text-[12px] font-semibold', live ? 'fill-amber' : 'fill-fg-dim')}>
        HV ON
      </text>

      {/* dial */}
      <path d={arc(0, 1, G.r)} fill="none" stroke="var(--viz-track)" strokeWidth="14" strokeLinecap="round" />
      {frac > 0 && <path d={arc(0, Math.max(0.001, frac), G.r)} fill="none" stroke={live ? 'var(--viz-violet)' : 'var(--viz-tick-minor)'} strokeWidth="10" strokeLinecap="round" style={{ transition: 'd 0.3s' }} />}
      {Array.from({ length: 36 }, (_, k) => {
        const fr = k / 35;
        const major = k % 5 === 0;
        const [x1, y1] = pt(fr, G.r - (major ? 24 : 18));
        const [x2, y2] = pt(fr, G.r - 11);
        return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke={major ? 'var(--viz-tick-major)' : 'var(--viz-tick-minor)'} strokeWidth={major ? 1.6 : 1} />;
      })}
      {LABELS.map(([fr, t]) => {
        const [tx, ty] = pt(fr, G.r - 40);
        return (
          <text key={t} x={tx} y={ty + 4} textAnchor="middle" className="fill-fg-muted font-mono text-[12px]">
            {t}
          </text>
        );
      })}
      <Rotor angle={-90 + 180 * frac} from={-90} cx={G.cx} cy={G.cy} stiffness={60} damping={14}>
        <polygon points={`${G.cx - 4},${G.cy} ${G.cx},${G.cy - G.r + 16} ${G.cx + 4},${G.cy}`} fill={live ? 'var(--viz-amber-soft)' : 'var(--viz-needle)'} />
      </Rotor>
      <circle cx={G.cx} cy={G.cy} r={10} fill="var(--viz-ink)" stroke={live ? 'var(--viz-amber)' : 'var(--color-accent)'} strokeWidth="2" />
      <circle cx={G.cx} cy={G.cy} r={4} fill={live ? 'var(--viz-amber)' : 'var(--color-accent)'} />

      {/* reading */}
      <text x={G.cx} y={y + 212} textAnchor="middle" className={cn('font-mono text-[34px] font-semibold', r ? 'fill-fg' : 'fill-fg-dim')}>
        {r ? f.value : '—'}
        <tspan className="fill-fg-dim text-[16px]"> {f.unit}</tspan>
      </text>
      <text x={G.cx} y={y + 232} textAnchor="middle" className="fill-accent font-mono text-[12px] font-semibold">
        {pairName ? `${pairName} · insulation resistance` : 'not connected'}
      </text>

      {/* stat row */}
      {stats.map(([k, v, ok], i) => (
        <g key={k}>
          <rect x={x + 14 + i * cellW} y={y + 246} width={cellW - 2} height={44} fill="var(--viz-track)" />
          <text x={x + 14 + i * cellW + (cellW - 2) / 2} y={y + 262} textAnchor="middle" className="fill-fg-dim font-mono text-[10.5px]">
            {k}
          </text>
          <text
            x={x + 14 + i * cellW + (cellW - 2) / 2}
            y={y + 282}
            textAnchor="middle"
            className={cn('font-mono text-[15px] font-semibold', ok === null ? 'fill-fg' : ok ? 'fill-ok' : 'fill-fault')}
          >
            {v}
          </text>
        </g>
      ))}

      {/* terminals */}
      <Jack at={PLUS} color="var(--color-phase-r)" sign="+" label="LINE" />
      <Jack at={[(PLUS[0] + MINUS[0]) / 2, PLUS[1]]} color="var(--color-ok)" sign="G" label="GUARD" />
      <Jack at={MINUS} color="var(--viz-tick-major)" sign="−" label="EARTH" />
    </g>
  );
}
