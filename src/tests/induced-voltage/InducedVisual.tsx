import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useId } from 'react';
import { cn } from '@/lib/format';
import type { TestObject } from '@/store/types';
import { parseVectorGroup } from '@/tests/shared/transformer';
import { LL, LoadLossDefs, LoadLossTransformer, SupplyBox, bushingIdx, busRuns, hvTop, type CoilState } from '@/tests/shared/LoadLossTransformer';
import { BENCH, SourceRack, Spark, XF, stressColor } from '@/tests/shared/HvBench';
import { Flow } from '@/tests/shared/Wiring';
import { IVT_STEP_UP, ivtPlan, ivtVariacV, type IvtReading } from './runInducedVoltageTest';

/**
 * Induced overvoltage on the bench: frequency converter → variac → step-up set
 * → HV box → HV bushings; LV left open (its induced voltage is read).
 * Above rated voltage the drawing shows the extra stress: conductors go from
 * amber to red, the HV coils glow, flux and hum get harder, small
 * turn-to-turn discharges flicker on the coils and corona crackles on the HV
 * bushing tops.
 */
export function IvtVisual({ o, reading }: { o: TestObject; reading: IvtReading | null }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${uid}-${n}`;
  const reduce = useReducedMotion();
  const plan = ivtPlan(o);
  const vg = parseVectorGroup(o.vectorGroup);
  const single = o.phases === '1';
  const hvIdx = bushingIdx(single, vg.hv.neutral);
  const lvIdx = bushingIdx(single, vg.lv.neutral);

  const phase = reading?.phase ?? null;
  const running = phase !== null && phase !== 'done';
  const kv = running ? (reading?.kv ?? 0) : 0;
  const live = running && kv > 0.05;
  const ratio = kv / plan.ratedKv;
  const over = Math.max(0, Math.min(1, ratio - 1));
  const hard = over > 0.5;
  const frac = Math.min(1, ivtVariacV(kv) / IVT_STEP_UP.lvV);
  const hot = stressColor(over);

  const hvRuns = busRuns('HV', hvIdx, single);
  const lvRuns = busRuns('LV', lvIdx, single);
  const limbs = single ? [LL.LIMBS[0], LL.LIMBS[2]] : LL.LIMBS;
  const coilState = (s: CoilState): CoilState[] => [0, 1, 2].map(() => (live ? s : 'idle'));

  return (
    <svg viewBox={`0 0 ${BENCH.w} ${BENCH.h}`} className="w-full rounded-[6px] border border-line bg-ink-850" role="img" aria-label={`Induced overvoltage: ${kv.toFixed(1)} kV on HV, ${ratio.toFixed(2)} times rated`}>
      <LoadLossDefs id={id} />
      <defs>
        <linearGradient id={id('stressbar')} gradientUnits="userSpaceOnUse" x1="24" x2="340" y1="0" y2="0">
          <stop offset="0" stopColor="var(--color-ok)" />
          <stop offset="0.5" stopColor="var(--color-ok)" />
          <stop offset="0.62" stopColor="var(--viz-amber)" />
          <stop offset="1" stopColor="var(--color-fault)" />
        </linearGradient>
        <radialGradient id={id('corona')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#d9c8ff" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#8f7bff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#8f7bff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('heat')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--color-fault)" stopOpacity="0.6" />
          <stop offset="1" stopColor="var(--color-fault)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <StressMeter ratio={ratio} live={live} id={id} plan={plan} />

      <SourceRack
        frac={frac}
        live={running}
        stress={over}
        variacV={ivtVariacV(kv)}
        converterHz={plan.hz}
        stepUp={{ title: 'STEP-UP SET', ratio: `0.415 / ${IVT_STEP_UP.hvKv} kV` }}
        mainsHz={plan.mainsHz}
      />

      {/* overvoltage banner */}
      <AnimatePresence>
        {live && ratio > 1.001 && (
          <motion.g key="ov" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <rect x={600} y={6} width={440} height={28} rx={14} fill="var(--color-fault-deep)" stroke={hot} strokeWidth="1.5" />
            {!reduce && <motion.rect x={600} y={6} width={440} height={28} rx={14} fill="none" stroke={hot} strokeWidth="2" animate={{ opacity: [0.9, 0.1, 0.9] }} transition={{ duration: hard ? 0.5 : 0.9, repeat: Infinity }} />}
            <text x={820} y={25} textAnchor="middle" className="fill-fault font-mono text-[13px] font-bold tracking-[0.06em]">
              ⚡ OVERVOLTAGE {ratio.toFixed(2)} × Un · {kv.toFixed(1)} kV · {plan.hz} Hz
            </text>
          </motion.g>
        )}
      </AnimatePresence>

      <g transform={`translate(${XF.x} ${XF.y}) scale(${XF.s})`}>
        <g className={cn(live && (hard ? 'hum-hard' : 'hum'))}>
          {/* HV: test voltage in */}
          {hvRuns.map((r) => (
            <g key={r.bi}>
              <path d={r.d} fill="none" stroke={live ? hot : r.color} strokeOpacity={live ? 1 : 0.75} strokeWidth={live ? 3 : 2.2} strokeLinejoin="round" />
              {live && !reduce && <Flow d={r.d} fwd color={over > 0 ? '#fff1e0' : 'var(--viz-amber-soft)'} size={2.6} gap={over > 0.4 ? 14 : 24} speed={over > 0.4 ? 0.28 : 0.55} />}
            </g>
          ))}
          <SupplyBox side="HV" title="HV · TEST VOLTAGE" value={kv.toFixed(2)} unit={`kV · ${plan.hz} Hz`} live={live} runs={hvRuns} note={live ? `${ratio.toFixed(2)} × Un` : 'STANDBY'} />
          {/* LV: open, induced voltage read by a voltmeter */}
          {lvRuns.map((r) => (
            <path key={r.bi} d={r.d} fill="none" stroke={r.color} strokeOpacity={live ? 0.95 : 0.6} strokeWidth={live ? 2.4 : 1.8} strokeDasharray={live ? undefined : '5 4'} strokeLinejoin="round" />
          ))}
          <SupplyBox side="LV" title="LV · OPEN" value={live ? Math.round(reading?.lvV ?? 0).toString() : '0'} unit="V induced" live={live} runs={lvRuns} note={live ? 'VOLTMETER ONLY' : 'NO LOAD'} />

          <LoadLossTransformer
            id={id}
            single={single}
            hvIdx={hvIdx}
            lvIdx={lvIdx}
            hvCoils={coilState('live')}
            lvCoils={coilState('induced')}
            hotHv={live ? hvIdx : []}
            hotLv={[]}
            live={live}
            hvCoilFill={live && over > 0 ? `color-mix(in srgb, var(--viz-live-fill) ${Math.round((1 - over) * 85 + 10)}%, var(--color-fault))` : undefined}
            caption={`${o.hvVoltageKv || '—'} kV / ${o.lvVoltageV || '—'} V · ${o.vectorGroup}`}
            hvRole={live ? (over > 0 ? `OVERVOLTAGE ${ratio.toFixed(2)}×` : `${kv.toFixed(1)} kV`) : 'TEST SUPPLY · OFF'}
            lvRole={live ? 'OPEN · INDUCED' : 'OPEN'}
          >
            {/* winding stress: heat glow on every limb, harder as the voltage climbs */}
            {live &&
              over > 0 &&
              limbs.map((cx, k) => (
                <motion.ellipse
                  key={cx}
                  cx={cx}
                  cy={262}
                  rx={40}
                  ry={46}
                  fill={`url(#${id('heat')})`}
                  initial={{ opacity: 0 }}
                  animate={reduce ? { opacity: over * 0.8 } : { opacity: [over * 0.45, over * 0.95, over * 0.45], scale: [1, 1.06, 1] }}
                  transition={{ duration: hard ? 0.6 : 1.1, repeat: Infinity, delay: k * 0.15 }}
                />
              ))}
            {/* turn-to-turn discharges flicker on the HV coil edges */}
            {limbs.map((cx) =>
              [
                [cx - 27, 238, cx - 27, 250],
                [cx + 27, 268, cx + 27, 282],
                [cx - 27, 276, cx - 27, 288],
              ].map(([x1, y1, x2, y2], j) => (
                <Spark key={`${cx}-${j}`} a={[x1, y1]} b={[x2, y2]} active={live && over > 0.35 + j * 0.15} intensity={over} amp={3} width={1} color="#ffd2b0" />
              )),
            )}
          </LoadLossTransformer>

          {/* corona on the HV bushing tops */}
          {hvIdx.map((bi) => {
            const x = LL.HV_XS[bi];
            const y = hvTop - 7;
            const on = live && over > 0.45;
            return (
              <g key={bi}>
                {on && !reduce && (
                  <motion.circle cx={x} cy={y} r={14} fill={`url(#${id('corona')})`} animate={{ opacity: [0.4, 1, 0.5], r: [10, 16 + over * 6, 11] }} transition={{ duration: 0.5 + bi * 0.07, repeat: Infinity }} />
                )}
                <Spark a={[x, y - 2]} b={[x - 12, y - 14]} active={on} intensity={over} amp={3} width={0.9} color="#c9b8ff" />
                <Spark a={[x, y - 2]} b={[x + 11, y - 16]} active={on && over > 0.7} intensity={over} amp={3} width={0.9} color="#c9b8ff" />
              </g>
            );
          })}
        </g>
        <text x={412} y={372} textAnchor="middle" className={cn('font-mono text-[13px] font-bold', over > 0 ? 'fill-fault' : live ? 'fill-amber' : 'fill-fg-muted')}>
          {phase === 'connect'
            ? `FREQUENCY CONVERTER → ${plan.hz} Hz`
            : live
              ? phase === 'hold'
                ? `HOLDING ${plan.targetKv} kV · ${Math.floor(reading?.holdS ?? 0)} / ${plan.holdS} s`
                : phase === 'down'
                  ? 'RAMPING DOWN'
                  : `RAISING · ${kv.toFixed(1)} kV`
              : ''}
        </text>
      </g>
    </svg>
  );
}

/** V / Un bar: green up to rated, amber → red through the overvoltage zone up to 2 × Un. */
function StressMeter({ ratio, live, id, plan }: { ratio: number; live: boolean; id: (n: string) => string; plan: ReturnType<typeof ivtPlan> }) {
  const x0 = 24;
  const w = 316;
  const y = 42;
  const f = Math.max(0, Math.min(1, ratio / 2));
  return (
    <g>
      <text x={x0} y={22} className="fill-accent font-mono text-[11.5px] font-semibold">
        VOLTAGE STRESS · V / Un
      </text>
      <text x={x0 + w} y={22} textAnchor="end" className={cn('font-mono text-[13px] font-bold', ratio > 1.001 ? 'fill-fault' : live ? 'fill-amber' : 'fill-fg-dim')}>
        {ratio.toFixed(2)} ×
      </text>
      <rect x={x0} y={y} width={w} height={14} rx={7} fill="var(--viz-track)" />
      <rect x={x0} y={y} height={14} rx={7} width={Math.max(0.001, w * f)} fill={`url(#${id('stressbar')})`} />
      <rect x={x0} y={y} width={w} height={14} rx={7} fill="none" stroke="var(--viz-stem)" />
      {[0, 0.5, 1].map((m) => (
        <g key={m}>
          <line x1={x0 + w * m} x2={x0 + w * m} y1={y - 4} y2={y + 18} stroke={m === 0.5 ? 'var(--viz-tick-major)' : 'var(--viz-tick-minor)'} strokeWidth={m === 0.5 ? 2 : 1} />
          <text x={x0 + w * m} y={y + 32} textAnchor={m === 0 ? 'start' : m === 1 ? 'end' : 'middle'} className="fill-fg-dim font-mono text-[10px]">
            {m === 0 ? '0' : m === 0.5 ? `RATED ${plan.ratedKv} kV` : `2 × Un · ${plan.targetKv} kV`}
          </text>
        </g>
      ))}
      <polygon points={`${x0 + w * f},${y - 3} ${x0 + w * f - 6},${y - 12} ${x0 + w * f + 6},${y - 12}`} fill={ratio > 1.001 ? 'var(--color-fault)' : 'var(--viz-amber)'} />
      <text x={x0} y={y + 52} className="fill-fg-muted font-mono text-[10px]">
        2 × V at 2 × f ({plan.hz} Hz) → flux stays at rated, core not saturated
      </text>
    </g>
  );
}
