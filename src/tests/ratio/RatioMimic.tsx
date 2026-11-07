import { motion, useReducedMotion } from 'framer-motion';
import { useId } from 'react';
import { cn } from '@/lib/format';
import type { TestObject } from '@/store/types';
import { LL, LoadLossDefs, LoadLossTransformer, SupplyBox, bushingIdx, busRuns, type CoilState } from '@/tests/shared/LoadLossTransformer';
import { Rotor } from '@/tests/shared/Rotor';
import { Jack, type Pt } from '@/tests/shared/TransformerParts';
import { parseVectorGroup } from '@/tests/shared/transformer';
import { Flow, rounded } from '@/tests/shared/Wiring';
import { RATIO_PHASES, RATIO_TOLERANCE_PCT, errorOf, ratioOf } from './calculation';
import type { TtrPlan, TtrReading } from './runRatioTest';

const PH = ['var(--color-phase-r)', 'var(--color-phase-y)', 'var(--color-phase-b)'];
const PH_NAME = ['R', 'Y', 'B'];
const EASE = [0.22, 1, 0.36, 1] as const;
/** Colour of the stepped-down LV voltage coming back to the meter. */
const IN_COLOR = '#bfe3ff';

// ── Geometry (viewBox 1320 × 480) ──────────────────────────────────────────
/** The load-loss transformer frame (720 × 360), drawn 1.15× like the other instrument screens. */
const XF = { x: 34, y: 40, s: 1.15 };
const at = (x: number, y: number): Pt => [XF.x + x * XF.s, XF.y + y * XF.s];
const box = (b: { x: number; y: number; w: number; h: number }) => {
  const [x0, y0] = at(b.x, b.y);
  const [x1, y1] = at(b.x + b.w, b.y + b.h);
  return { x0, y0, x1, y1 };
};
const HVB = box(LL.BOX_HV);
const LVB = box(LL.BOX_LV);
/** Lead terminals on the outer end of each box, R Y B from the top. */
const TERM_Y = [84, 109, 134];

/** The ratio meter is drawn at 0.92 so the transformer keeps its size. */
const METER = { x: 958, y: 70, w: 384, h: 384, s: 0.92 };
const H_JACK: Pt[] = [0, 1, 2].map((k) => [METER.x + (48 + k * 46) * METER.s, METER.y]);
/** LV jack block on the meter's left side, level with the LV box terminals. */
const X_BLOCK = { x: 896, y: 62, w: 52, h: 96 };
const X_JACK: Pt[] = TERM_Y.map((y) => [X_BLOCK.x + 16, y]);
/**
 * HV leads go up from the meter, over the top and down the outer end of the HV
 * box. H1 takes the lowest lane and lands on top, H3 the highest lane and lands
 * at the bottom, so no lead crosses another.
 */
const H_LANE_Y = [48, 34, 20];
const H_LANE_X = [HVB.x0 - 12, HVB.x0 - 26, HVB.x0 - 40];
const H_LEAD = (k: number): Pt[] => [H_JACK[k], [H_JACK[k][0], H_LANE_Y[k]], [H_LANE_X[k], H_LANE_Y[k]], [H_LANE_X[k], TERM_Y[k]], [HVB.x0, TERM_Y[k]]];
const X_LEAD = (k: number): Pt[] => [X_JACK[k], [LVB.x1, TERM_Y[k]]];
const TAP_KNOB = { cx: 118, cy: 316 };

/**
 * Voltage ratio drawn with the same transformer as the load-loss screen: the
 * HV test supply box on the left end, the LV box on the right end, bus
 * conductors to every bushing. The ratio meter's H1–H3 leads run over the top
 * to the HV box and X1–X3 come straight across to the LV box. On START the six
 * leads lay out one by one and a continuity pulse runs down each; with the
 * supply on, amber pulses run out of the meter into HV and blue-white ones come
 * back from LV. The tap switch clicks tap by tap; the meter shows HV, LV and
 * HV ÷ LV per phase against the rated ratio of the tap.
 */
export function RatioMimic({ o, plan, reading }: { o: TestObject; plan: TtrPlan; reading: TtrReading | null }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${uid}-${n}`;
  const reduce = !!useReducedMotion();
  const single = o.phases === '1';
  const nPh = single ? 1 : 3;
  const connecting = !!reading?.connecting;
  // leads are on while connecting or measuring; a saved result alone does not count
  const connected = connecting || reading?.tapIndex != null;
  const ti = reading?.tapIndex ?? null;
  const tap = ti !== null ? plan[ti] : null;
  const lv = reading?.lvV ?? [];
  const hv = reading?.hvV ?? [];
  const on = ti !== null && (lv[0] ?? 0) > 1;
  const ratios = Array.from({ length: nPh }, (_, i) => (on ? ratioOf(hv[i] ?? 0, lv[i] ?? 0) : NaN));
  const errs = ratios.map((r) => (tap ? errorOf(r, tap.rated) : NaN));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const hvAvg = avg(hv.slice(0, nPh));
  const lvAvg = avg(lv.slice(0, nPh));

  const vg = parseVectorGroup(o.vectorGroup);
  const idx = { HV: bushingIdx(single, vg.hv.neutral), LV: bushingIdx(single, vg.lv.neutral) };
  const coils = (state: CoilState): CoilState[] => [0, 1, 2].map(() => (on ? state : 'idle'));

  // tap switch handle: positions over 240°
  const n = plan.length;
  const tapAngle = (i: number) => (n > 1 ? -120 + (240 * i) / (n - 1) : 0);

  // the six leads in the order they are connected: H1 H2 H3, then X1 X2 X3
  const leads = (['HV', 'LV'] as const).flatMap((side) =>
    Array.from({ length: nPh }, (_, k) => ({ key: `${side}${k}`, k, side, pts: side === 'HV' ? H_LEAD(k) : X_LEAD(k) })),
  );

  return (
    <svg viewBox="0 0 1320 480" className="w-full rounded-[6px] border border-line bg-ink-850" role="img" aria-label="Ratio meter applying voltage to the HV box through three leads and measuring the LV box through three leads">
      <LoadLossDefs id={id} />
      <defs>
        <linearGradient id={id('bezel')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--viz-metal)" />
          <stop offset="0.08" stopColor="var(--viz-stem)" />
          <stop offset="1" stopColor="var(--viz-ink)" />
        </linearGradient>
        <linearGradient id={id('glass')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.09" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ── transformer: HV test supply on the left end, LV measured on the right end ── */}
      <g transform={`translate(${XF.x} ${XF.y}) scale(${XF.s})`}>
        {(['HV', 'LV'] as const).map((side) => {
          const runs = busRuns(side, idx[side], single);
          const hvSide = side === 'HV';
          return (
            <g key={side}>
              {runs.map((run) => (
                <g key={run.bi}>
                  <path d={run.d} fill="none" stroke={run.color} strokeOpacity={on ? 1 : 0.75} strokeWidth={on ? 2.8 : 2.2} strokeLinejoin="round" />
                  {on && !reduce && run.bi < 3 && (
                    <Flow d={run.d} fwd={hvSide} color={hvSide ? 'var(--viz-amber)' : IN_COLOR} size={2.8} gap={24} speed={hvSide ? 0.55 : 0.8} delay={0.3} />
                  )}
                </g>
              ))}
              <SupplyBox
                side={side}
                title={hvSide ? 'HV SUPPLY' : 'LV SIDE'}
                value={on ? (hvSide ? hvAvg.toFixed(1) : lvAvg.toFixed(2)) : '0.0'}
                unit={hvSide ? `V AC · ${single ? '1' : '3'}-PH` : 'V AC · MEASURED'}
                live={on}
                runs={runs}
                note={on ? (hvSide ? 'APPLIED' : 'INDUCED') : connecting ? 'LEADS CONNECTING' : 'STANDBY'}
              />
            </g>
          );
        })}
        <LoadLossTransformer
          id={id}
          single={single}
          hvIdx={idx.HV}
          lvIdx={idx.LV}
          hvCoils={coils('live')}
          lvCoils={coils('induced')}
          hotHv={on ? idx.HV : []}
          hotLv={on ? idx.LV.filter((b) => b < 3) : []}
          live={on}
          caption={`${o.hvVoltageKv || '—'} kV / ${o.lvVoltageV || '—'} V · ${o.ratedPowerKva || '—'} kVA`}
          hvRole={on ? `${hvAvg.toFixed(0)} V APPLIED` : connecting ? 'LEADS CONNECTING' : 'SUPPLY · STANDBY'}
          lvRole={on ? `${lvAvg.toFixed(2)} V INDUCED` : 'MEASURED · STANDBY'}
        >
          {on && (
            <g>
              <motion.ellipse
                cx={412}
                cy={262}
                rx={130}
                ry={50}
                fill={`url(#${id('ll-stress')})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: reduce ? 0.8 : [0.35, 0.9, 0.35] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              />
              <text x={412} y={266} textAnchor="middle" className="fill-amber font-mono text-[12px] font-bold">
                HV energised · LV induced
              </text>
            </g>
          )}
        </LoadLossTransformer>
      </g>

      {/* lead terminals on the outer end of each box */}
      {Array.from({ length: nPh }, (_, k) => (
        <g key={`term-${k}`}>
          <circle cx={HVB.x0} cy={TERM_Y[k]} r={3.5} fill={PH[k]} stroke="var(--viz-ink)" strokeWidth="1" />
          <circle cx={LVB.x1} cy={TERM_Y[k]} r={3.5} fill={PH[k]} stroke="var(--viz-ink)" strokeWidth="1" />
        </g>
      ))}

      {/* ── tap switch ─────────────────────────────── */}
      <text x={TAP_KNOB.cx} y={TAP_KNOB.cy - 62} textAnchor="middle" className="fill-fg-muted font-mono text-[11px] font-semibold tracking-[0.1em]">
        TAP SWITCH
      </text>
      <circle cx={TAP_KNOB.cx} cy={TAP_KNOB.cy} r={38} fill="var(--viz-ink)" stroke="var(--viz-metal)" strokeWidth="2.5" />
      <circle cx={TAP_KNOB.cx} cy={TAP_KNOB.cy} r={32} fill="none" stroke="var(--viz-track)" strokeWidth="1" />
      {plan.map((t, i) => {
        const a = ((tapAngle(i) - 90) * Math.PI) / 180;
        const done = reading?.rows.some((r) => r.tap === t.tap);
        const cur = ti === i;
        return (
          <g key={t.tap}>
            <circle cx={TAP_KNOB.cx + 29 * Math.cos(a)} cy={TAP_KNOB.cy + 29 * Math.sin(a)} r={cur ? 4.5 : 3} fill={cur ? 'var(--viz-amber)' : done ? 'var(--color-ok)' : 'var(--viz-tick-minor)'} />
            {n <= 13 && (
              <text x={TAP_KNOB.cx + 49 * Math.cos(a)} y={TAP_KNOB.cy + 49 * Math.sin(a) + 4} textAnchor="middle" className={cn('font-mono text-[11px]', cur ? 'fill-amber font-bold' : t.nominal ? 'fill-accent' : 'fill-fg-dim')}>
                {t.tap}
              </text>
            )}
          </g>
        );
      })}
      {ti !== null && !reduce && (
        <motion.circle key={`click-${ti}`} cx={TAP_KNOB.cx} cy={TAP_KNOB.cy} fill="none" stroke="var(--viz-amber)" strokeWidth="2" initial={{ r: 14, opacity: 0.9 }} animate={{ r: 46, opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }} />
      )}
      <Rotor angle={ti !== null ? tapAngle(ti) : tapAngle(0)} from={tapAngle(0)} cx={TAP_KNOB.cx} cy={TAP_KNOB.cy} stiffness={170} damping={11}>
        <rect x={TAP_KNOB.cx - 7} y={TAP_KNOB.cy - 31} width={14} height={38} rx={7} fill="var(--viz-copper)" stroke="var(--viz-ink)" strokeWidth="1.5" />
        <circle cx={TAP_KNOB.cx} cy={TAP_KNOB.cy} r={12} fill="var(--viz-metal)" stroke="var(--viz-ink)" strokeWidth="2" />
        <circle cx={TAP_KNOB.cx} cy={TAP_KNOB.cy} r={4} fill="var(--viz-ink)" />
      </Rotor>
      <text x={TAP_KNOB.cx} y={TAP_KNOB.cy + 68} textAnchor="middle" className="fill-fg font-mono text-[13px] font-bold">
        TAP {tap ? tap.tap : '—'}
        <tspan className="fill-fg-dim font-normal"> {tap ? `(${tap.pct >= 0 ? '+' : ''}${tap.pct.toFixed(1)}%)` : ''}</tspan>
      </text>

      {/* ── ratio meter ─────────────────────────────── */}
      <g transform={`translate(${METER.x} ${METER.y}) scale(${METER.s})`}>
        <RatioMeter
          idOf={id}
          x={0}
          y={0}
          w={METER.w}
          h={METER.h}
          nPh={nPh}
          on={on}
          recording={!!reading?.recording}
          connecting={connecting}
          hv={hv}
          lv={lv}
          ratios={ratios}
          errs={errs}
          rated={tap?.rated ?? null}
          tapNo={tap?.tap ?? null}
        />
        {Array.from({ length: nPh }, (_, k) => (
          <g key={`hjack-${k}`}>
            <Jack at={[48 + k * 46, 0]} color={PH[k]} sign="" label="" />
            <text x={48 + k * 46} y={32} textAnchor="middle" className="fill-fg font-mono text-[11px] font-bold">
              H{k + 1}
            </text>
          </g>
        ))}
        <text x={48 + 46} y={48} textAnchor="middle" className="fill-fg-dim font-mono text-[10.5px]">
          TO HV
        </text>
      </g>
      {/* LV jack block on the meter's left side */}
      <rect x={X_BLOCK.x} y={X_BLOCK.y} width={X_BLOCK.w} height={X_BLOCK.h} rx={6} fill="var(--viz-ink)" stroke="var(--viz-metal)" strokeWidth="1.4" />
      {Array.from({ length: nPh }, (_, k) => (
        <g key={`xjack-${k}`}>
          <circle cx={X_JACK[k][0]} cy={X_JACK[k][1]} r={9.5} fill="var(--viz-track)" stroke={PH[k]} strokeWidth="2.6" />
          <circle cx={X_JACK[k][0]} cy={X_JACK[k][1]} r={3.5} fill="var(--viz-metal)" />
          <text x={X_JACK[k][0] + 15} y={X_JACK[k][1] + 4} className="fill-fg font-mono text-[11px] font-bold">
            X{k + 1}
          </text>
        </g>
      ))}
      <text x={X_BLOCK.x + X_BLOCK.w / 2} y={X_BLOCK.y + X_BLOCK.h + 16} textAnchor="middle" className="fill-fg-dim font-mono text-[10.5px]">
        TO LV
      </text>

      {/* ── six test leads: lay out one by one, lug on, continuity pulse; voltage out on H, back on X ── */}
      {leads.map((l, j) => (
        <RatioLead
          key={l.key}
          pts={l.pts}
          color={PH[l.k]}
          connected={connected}
          delay={reduce ? 0 : j * 0.55}
          pulseAt={reduce ? 0 : leads.length * 0.55 + 0.6 + j * 0.08}
          live={on}
          outward={l.side === 'HV'}
          reduce={reduce}
        />
      ))}
    </svg>
  );
}

/**
 * The ratio meter: brushed bezel with corner screws, nameplate, status LEDs,
 * a glass display (big ratio with unlit segments behind, error bar) and one
 * row per phase.
 */
function RatioMeter({
  idOf,
  x,
  y,
  w,
  h,
  nPh,
  on,
  recording,
  connecting,
  hv,
  lv,
  ratios,
  errs,
  rated,
  tapNo,
}: {
  idOf: (n: string) => string;
  x: number;
  y: number;
  w: number;
  h: number;
  nPh: number;
  on: boolean;
  recording: boolean;
  connecting: boolean;
  hv: number[];
  lv: number[];
  ratios: number[];
  errs: number[];
  rated: number | null;
  tapNo: number | null;
}) {
  const ok0 = Number.isFinite(errs[0]) && Math.abs(errs[0]) <= RATIO_TOLERANCE_PCT;
  const allOk = errs.every((e) => Number.isFinite(e) && Math.abs(e) <= RATIO_TOLERANCE_PCT);
  const disp = { x: x + 18, y: y + 104, w: w - 36, h: 124 };
  const bar = { x: disp.x + 16, w: disp.w - 32, y: disp.y + 96 };
  const pos = (e: number) => bar.x + bar.w * Math.max(0, Math.min(1, 0.5 + e / 2)); // −1 % … +1 %
  const rowY = (i: number) => y + 268 + i * 34;
  const leds: Array<[string, boolean, string, boolean]> = [
    ['HV OUT', on, 'var(--viz-amber)', false],
    ['MEASURE', recording, 'var(--color-phase-b)', true],
    ['PASS', on && allOk, 'var(--color-ok)', false],
  ];

  return (
    <g>
      {/* case */}
      <rect x={x + 4} y={y + 8} width={w} height={h} rx={14} fill="#000" fillOpacity="0.35" />
      <rect x={x} y={y} width={w} height={h} rx={14} fill={`url(#${idOf('bezel')})`} stroke={on ? 'var(--viz-amber)' : 'var(--viz-metal)'} strokeWidth="1.6" />
      <rect x={x + 8} y={y + 8} width={w - 16} height={h - 16} rx={10} fill="var(--viz-ink)" stroke="var(--viz-stem)" />
      {[
        [x + 16, y + 16],
        [x + w - 16, y + 16],
        [x + 16, y + h - 16],
        [x + w - 16, y + h - 16],
      ].map(([sx, sy], k) => (
        <g key={k}>
          <circle cx={sx} cy={sy} r={4.5} fill="var(--viz-metal)" stroke="var(--viz-ink)" />
          <line x1={sx - 3} y1={sy - 1.5} x2={sx + 3} y2={sy + 1.5} stroke="var(--viz-ink)" strokeWidth="1.2" />
        </g>
      ))}

      {/* nameplate + LEDs */}
      <rect x={x + 8} y={y + 58} width={w - 16} height={34} fill="var(--color-plate)" />
      <line x1={x + 8} x2={x + w - 8} y1={y + 92} y2={y + 92} stroke="var(--color-accent)" strokeWidth="2" />
      <text x={x + 22} y={y + 80} fill="var(--color-plate-fg)" className="font-display text-[13px] font-semibold tracking-[0.12em]">
        RATIO METER · {nPh === 1 ? '1-PH' : '3-PH'}
      </text>
      {leds.map(([label, lit, color, blink], k) => {
        const cx = x + w - 168 + k * 54;
        return (
          <g key={label}>
            {lit && !blink && <circle cx={cx} cy={y + 71} r={9} fill={color} opacity="0.25" />}
            {lit && blink ? (
              <motion.circle cx={cx} cy={y + 71} r={5} fill={color} animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.6, repeat: Infinity }} />
            ) : (
              <circle cx={cx} cy={y + 71} r={5} fill={lit ? color : 'var(--viz-tick-minor)'} />
            )}
            <text x={cx} y={y + 87} textAnchor="middle" className="fill-fg-dim font-mono text-[8.5px]">
              {label}
            </text>
          </g>
        );
      })}

      {/* glass display */}
      <rect x={disp.x} y={disp.y} width={disp.w} height={disp.h} rx={8} fill="var(--viz-track)" stroke="var(--viz-stem)" strokeWidth="1.5" />
      <text x={disp.x + 16} y={disp.y + 22} className="fill-fg-muted font-mono text-[11.5px]">
        RATIO {nPh === 1 ? '' : 'R–Y'} · HV applied ÷ LV measured
      </text>
      <text x={disp.x + 16} y={disp.y + 66} className="font-mono text-[42px] font-semibold" fill="var(--viz-tick-minor)" fillOpacity="0.35">
        88.888
      </text>
      <text x={disp.x + 16} y={disp.y + 66} className={cn('font-mono text-[42px] font-semibold', on ? 'fill-fg' : 'fill-fg-dim')}>
        {on ? ratios[0].toFixed(3) : '--.---'}
      </text>
      {connecting && (
        <motion.text
          x={disp.x + disp.w / 2}
          y={disp.y + 92}
          textAnchor="middle"
          className="fill-amber font-mono text-[13px] font-bold"
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        >
          CONNECTING LEADS · CHECKING CONTINUITY
        </motion.text>
      )}
      <text x={disp.x + disp.w - 16} y={disp.y + 22} textAnchor="end" className="fill-fg-dim font-mono text-[11.5px]">
        RATED · TAP {tapNo ?? '—'}
      </text>
      <text x={disp.x + disp.w - 16} y={disp.y + 46} textAnchor="end" className="fill-fg font-mono text-[19px] font-semibold">
        {rated !== null ? rated.toFixed(3) : '—'}
      </text>
      <text x={disp.x + disp.w - 16} y={disp.y + 66} textAnchor="end" className={cn('font-mono text-[13px] font-bold', !Number.isFinite(errs[0]) ? 'fill-fg-dim' : ok0 ? 'fill-ok' : 'fill-fault')}>
        {Number.isFinite(errs[0]) ? `${errs[0] >= 0 ? '+' : ''}${errs[0].toFixed(3)} % ${ok0 ? '✓' : '✗'}` : ''}
      </text>
      {/* error bar −1 % … +1 %, green band ±0.5 % */}
      <g opacity={connecting ? 0.15 : 1}>
      <rect x={bar.x} y={bar.y} width={bar.w} height={7} rx={3.5} fill="var(--color-fault)" fillOpacity="0.25" />
      <rect x={bar.x + bar.w / 4} y={bar.y} width={bar.w / 2} height={7} fill="var(--color-ok)" fillOpacity="0.5" />
      <line x1={bar.x + bar.w / 2} x2={bar.x + bar.w / 2} y1={bar.y - 3} y2={bar.y + 10} stroke="var(--viz-tick-major)" />
      {['−1%', '−0.5', '0', '+0.5', '+1%'].map((t, k) => (
        <text key={t} x={bar.x + (bar.w * k) / 4} y={bar.y + 22} textAnchor="middle" className="fill-fg-dim font-mono text-[10px]">
          {t}
        </text>
      ))}
      </g>
      {errs.map((e, i) =>
        Number.isFinite(e) ? (
          <motion.polygon
            key={i}
            points="-6,-12 6,-12 0,-2"
            fill={PH[i]}
            initial={false}
            animate={{ x: pos(e), y: bar.y }}
            transition={{ type: 'spring', stiffness: 120, damping: 16 }}
          />
        ) : null,
      )}
      {/* glass reflection */}
      <rect x={disp.x} y={disp.y} width={disp.w} height={disp.h} rx={8} fill={`url(#${idOf('glass')})`} pointerEvents="none" />
      <path d={`M${disp.x + 10} ${disp.y + 6} L${disp.x + disp.w * 0.45} ${disp.y + 6} L${disp.x + disp.w * 0.32} ${disp.y + disp.h - 6} L${disp.x + 10} ${disp.y + disp.h - 6} Z`} fill="#ffffff" fillOpacity="0.025" pointerEvents="none" />

      {/* per-phase rows */}
      {(['PH', 'HV V in', 'LV V out', 'RATIO', 'ERR %'] as const).map((t, k) => (
        <text key={t} x={x + [26, 108, 196, 284, w - 26][k]} y={y + 248} textAnchor={k === 0 ? 'start' : 'end'} className="fill-fg-dim font-mono text-[11px]">
          {t}
        </text>
      ))}
      {Array.from({ length: nPh }, (_, i) => {
        const ok = Number.isFinite(errs[i]) && Math.abs(errs[i]) <= RATIO_TOLERANCE_PCT;
        return (
          <g key={i}>
            <rect x={x + 18} y={rowY(i) - 14} width={w - 36} height={28} rx={4} fill="var(--viz-track)" />
            <rect x={x + 18} y={rowY(i) - 14} width={4} height={28} fill={PH[i]} />
            <text x={x + 30} y={rowY(i) + 5} className="fill-fg font-mono text-[14px] font-bold">
              {nPh === 1 ? '1' : PH_NAME[i]}
            </text>
            <text x={x + 108} y={rowY(i) + 5} textAnchor="end" className="fill-fg font-mono text-[14px]">
              {on ? (hv[i] ?? 0).toFixed(1) : '—'}
            </text>
            <text x={x + 196} y={rowY(i) + 5} textAnchor="end" className="fill-fg font-mono text-[14px]">
              {on ? (lv[i] ?? 0).toFixed(3) : '—'}
            </text>
            <text x={x + 284} y={rowY(i) + 5} textAnchor="end" className="fill-fg font-mono text-[14px] font-semibold">
              {on ? ratios[i].toFixed(3) : '—'}
            </text>
            <text x={x + w - 26} y={rowY(i) + 5} textAnchor="end" className={cn('font-mono text-[13px] font-semibold', !Number.isFinite(errs[i]) ? 'fill-fg-dim' : ok ? 'fill-ok' : 'fill-fault')}>
              {Number.isFinite(errs[i]) ? `${errs[i] >= 0 ? '+' : ''}${errs[i].toFixed(3)}` : '—'}
            </text>
          </g>
        );
      })}
      {nPh === 3 && (
        <text x={x + w / 2} y={y + h - 20} textAnchor="middle" className="fill-fg-dim font-mono text-[10.5px]">
          {RATIO_PHASES.join(' · ')} line ratios · limit ±{RATIO_TOLERANCE_PCT} %
        </text>
      )}
    </g>
  );
}

/**
 * One test lead: a plug in the meter socket, then the insulated cable (dark
 * sheath, phase-coloured core, sheen) lays out along its route to the box
 * terminal and a ring lug lands on it. Once all six are on, a continuity pulse
 * runs down each. While the supply is on, pulses travel out of the meter on
 * the HV leads (amber) and back to the meter on the LV leads (blue-white).
 * Disconnecting pulls the lead back into the meter.
 */
function RatioLead({
  pts,
  color,
  connected,
  delay,
  pulseAt,
  live,
  outward,
  reduce,
}: {
  pts: Pt[];
  color: string;
  connected: boolean;
  delay: number;
  pulseAt: number;
  live: boolean;
  /** true: voltage from the meter into HV; false: induced voltage from LV back to the meter */
  outward: boolean;
  reduce: boolean;
}) {
  const d = rounded(pts, 10);
  const jack = pts[0];
  const end = pts[pts.length - 1];
  const lay = { duration: reduce ? 0 : 0.8, delay: connected ? delay + 0.15 : 0, ease: EASE };
  const drawn = connected ? 1 : 0;
  const strand = (stroke: string, width: number, opacity = 1) => (
    <motion.path
      d={d}
      fill="none"
      stroke={stroke}
      strokeOpacity={opacity}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={false}
      animate={{ pathLength: drawn }}
      transition={lay}
    />
  );

  return (
    <g>
      {strand('#0a0c10', 7.6)}
      {strand(color, 4.8)}
      {strand('#ffffff', 1.2, 0.25)}
      {live && connected && !reduce && <Flow d={d} fwd={outward} color={outward ? 'var(--viz-amber)' : IN_COLOR} size={3.2} gap={26} speed={outward ? 0.55 : 0.8} />}
      {/* continuity pulse after all leads are on */}
      {connected && !reduce && (
        <motion.path
          d={d}
          fill="none"
          stroke="#fff6d6"
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="0.08 1"
          initial={{ strokeDashoffset: 0.08, opacity: 0 }}
          animate={{ strokeDashoffset: [0.08, -1], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.75, delay: pulseAt, ease: 'easeInOut' }}
        />
      )}
      {/* plug in the meter socket */}
      <motion.g initial={false} animate={{ opacity: connected ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.2, delay: connected ? delay : 0.6 }}>
        <circle cx={jack[0]} cy={jack[1]} r={7.5} fill={color} stroke="#0a0c10" strokeWidth="1.6" />
        <circle cx={jack[0] - 2.2} cy={jack[1] - 2.2} r={2} fill="#ffffff" fillOpacity="0.35" />
      </motion.g>
      {/* ring lug on the box terminal */}
      <motion.g initial={false} animate={{ opacity: connected ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.2, delay: connected ? delay + 0.9 : 0 }}>
        <circle cx={end[0]} cy={end[1]} r={6.5} fill={color} stroke="#0a0c10" strokeWidth="1.5" />
        <circle cx={end[0]} cy={end[1]} r={2.2} fill="var(--viz-ink)" />
      </motion.g>
    </g>
  );
}
