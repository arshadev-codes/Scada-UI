import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useId } from 'react';
import { cn } from '@/lib/format';
import type { TestObject } from '@/store/types';
import { parseVectorGroup } from '@/tests/shared/transformer';
import { LL, LoadLossDefs, LoadLossTransformer, SupplyBox, bushingIdx, busRuns, hvTop, lvTop, type CoilState } from '@/tests/shared/LoadLossTransformer';
import { BENCH, ShortingLink, SourceRack, Spark, XF } from '@/tests/shared/HvBench';
import { EarthSymbol, type Pt } from '@/tests/shared/TransformerParts';
import { Flow, rounded } from '@/tests/shared/Wiring';
import { AVT_SET, AVT_TRIP_MA, avtPlan, avtVariacV, type AvtReading } from './runAppliedVoltageTest';

const LEAK = 'var(--viz-leak)';
const EARTH_Y = 356;
const EARTH_SYM_X = 640;

/**
 * Applied voltage on the bench: variac → HV test set → HV box → all HV
 * terminals shorted together. All LV terminals are shorted and earthed through
 * the leakage meter, the tank is earthed too. While the voltage is on, the
 * insulation leakage is shown as pale-blue pulses crossing HV → LV in the
 * cutaway and running down the earth leads, with small arcs crackling on the
 * LV side.
 */
export function AvtVisual({ o, reading }: { o: TestObject; reading: AvtReading | null }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${uid}-${n}`;
  const reduce = useReducedMotion();
  const plan = avtPlan(o);
  const vg = parseVectorGroup(o.vectorGroup);
  const single = o.phases === '1';
  const hvIdx = bushingIdx(single, vg.hv.neutral);
  const lvIdx = bushingIdx(single, vg.lv.neutral);

  const phase = reading?.phase ?? null;
  const running = phase !== null && phase !== 'done';
  const kv = running ? (reading?.kv ?? 0) : 0;
  const leak = running ? (reading?.leakMa ?? 0) : 0;
  const live = running && kv > 0.05;
  const level = Math.min(1, kv / plan.testKv);
  const frac = Math.min(1, avtVariacV(kv) / AVT_SET.lvV);

  const hvRuns = busRuns('HV', hvIdx, single);
  const lvXs = lvIdx.map((i) => LL.LV_XS[i]);
  const hvXs = hvIdx.map((i) => LL.HV_XS[i]);
  const lvLinkY = lvTop - 16;
  const limbs = single ? [LL.LIMBS[0], LL.LIMBS[2]] : LL.LIMBS;
  const B = LL.BOX_LV;

  // LV link → leakage meter (LV box) → earth bar; tank strap → earth bar
  const lvToMeter = rounded([[Math.max(...lvXs) + 8, lvLinkY], [585, lvLinkY], [585, B.y + B.h / 2], [B.x, B.y + B.h / 2]], 8);
  const meterToEarth = rounded([[B.x + B.w - 10, B.y + B.h], [B.x + B.w - 10, EARTH_Y], [EARTH_SYM_X, EARTH_Y]], 8);
  const tankToEarth = rounded([[300, 348], [300, EARTH_Y], [EARTH_SYM_X, EARTH_Y]], 8);
  const coils = (s: CoilState): CoilState[] => [0, 1, 2].map(() => (live ? s : 'idle'));

  return (
    <svg viewBox={`0 0 ${BENCH.w} ${BENCH.h}`} className="w-full rounded-[6px] border border-line bg-ink-850" role="img" aria-label={`Applied voltage ${kv.toFixed(1)} kV on HV, leakage ${leak.toFixed(2)} mA to earth`}>
      <LoadLossDefs id={id} />
      <defs>
        <radialGradient id={id('earthglow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={LEAK} stopOpacity="0.7" />
          <stop offset="1" stopColor={LEAK} stopOpacity="0" />
        </radialGradient>
      </defs>

      <LeakageMeter plan={plan} leak={leak} live={live} />

      <SourceRack frac={frac} live={running} variacV={avtVariacV(kv)} stepUp={{ title: 'HV TEST SET', ratio: `0.415 / ${AVT_SET.hvKv} kV` }} mainsHz={plan.hz} />

      <AnimatePresence>
        {live && (
          <motion.g key="banner" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <rect x={620} y={6} width={400} height={28} rx={14} fill="var(--color-amber-deep)" stroke="var(--viz-amber)" strokeWidth="1.5" />
            <text x={820} y={25} textAnchor="middle" className="fill-amber font-mono text-[13px] font-bold tracking-[0.04em]">
              ⚡ {kv.toFixed(1)} kV · HV → LV + EARTH · {plan.hz} Hz
            </text>
          </motion.g>
        )}
      </AnimatePresence>

      <g transform={`translate(${XF.x} ${XF.y}) scale(${XF.s})`}>
        <g className={cn(live && 'hum')}>
          {/* HV: all terminals fed together from the test set */}
          {hvRuns.map((r) => (
            <g key={r.bi}>
              <path d={r.d} fill="none" stroke={live ? 'var(--viz-amber)' : r.color} strokeOpacity={live ? 1 : 0.75} strokeWidth={live ? 3 : 2.2} strokeLinejoin="round" />
              {live && !reduce && <Flow d={r.d} fwd color="var(--viz-amber-soft)" size={2.6} gap={24} />}
            </g>
          ))}
          <SupplyBox side="HV" title="HV · TEST SET" value={kv.toFixed(2)} unit={`kV · ${plan.hz} Hz`} live={live} runs={hvRuns} note={live ? `${Math.round(level * 100)} % of ${plan.testKv} kV` : 'STANDBY'} />

          {/* earth bar + leads (green / yellow) */}
          <line x1={290} x2={EARTH_SYM_X + 70} y1={EARTH_Y} y2={EARTH_Y} stroke="var(--color-ok)" strokeWidth="3" />
          {[lvToMeter, meterToEarth, tankToEarth].map((d) => (
            <g key={d}>
              <path d={d} fill="none" stroke="var(--color-ok)" strokeWidth="3" strokeLinejoin="round" />
              <path d={d} fill="none" stroke="var(--color-phase-y)" strokeWidth="3" strokeDasharray="7 7" strokeLinejoin="round" />
            </g>
          ))}
          {live && !reduce && (
            <>
              <Flow d={lvToMeter} fwd color={LEAK} size={3} gap={20} speed={0.7} />
              <Flow d={meterToEarth} fwd color={LEAK} size={3} gap={20} speed={0.7} delay={0.2} />
              <Flow d={tankToEarth} fwd color={LEAK} size={3} gap={26} speed={0.9} delay={0.4} />
            </>
          )}
          <line x1={EARTH_SYM_X} x2={EARTH_SYM_X} y1={EARTH_Y} y2={EARTH_Y + 4} stroke="var(--viz-tick-major)" strokeWidth="2.2" />
          <EarthSymbol x={EARTH_SYM_X} y={EARTH_Y + 4} />
          {live && !reduce && (
            <motion.circle cx={EARTH_SYM_X} cy={EARTH_Y + 6} r={10} fill={`url(#${id('earthglow')})`} animate={{ r: [6, 16, 6], opacity: [0.9, 0.2, 0.9] }} transition={{ duration: 1.1, repeat: Infinity }} />
          )}
          <text x={EARTH_SYM_X + 16} y={EARTH_Y - 5} className="fill-ok font-mono text-[8.5px] font-semibold">
            EARTH
          </text>
          <text x={306} y={EARTH_Y - 5} className="fill-ok font-mono text-[8px]">
            TANK EARTH
          </text>

          <SupplyBox side="LV" title="LEAKAGE" value={leak.toFixed(2)} unit="mA" live={live} runs={[]} note={`TRIP ${AVT_TRIP_MA} mA`} />

          <LoadLossTransformer
            id={id}
            single={single}
            hvIdx={hvIdx}
            lvIdx={lvIdx}
            hvCoils={coils('live')}
            lvCoils={coils('induced')}
            hotHv={live ? hvIdx : []}
            hotLv={[]}
            live={live}
            caption={`${o.hvVoltageKv || '—'} kV / ${o.lvVoltageV || '—'} V · ${o.vectorGroup}`}
            hvRole={live ? `${kv.toFixed(1)} kV · ALL SHORTED` : 'SHORTED · TO TEST SET'}
            lvRole={live ? 'SHORTED · EARTHED · LEAKING' : 'SHORTED + EARTHED'}
          >
            {/* leakage through the HV → LV insulation (main gap) and HV → core */}
            {live &&
              !reduce &&
              limbs.map((cx) =>
                [244, 262, 280].map((y, j) => (
                  <g key={`${cx}-${y}`} opacity={0.35 + 0.65 * level}>
                    <Flow d={`M${cx - 27} ${y} H${cx - 17}`} fwd color={LEAK} size={2} gap={6} speed={0.45} delay={j * 0.1} />
                    <Flow d={`M${cx + 27} ${y + 6} H${cx + 17}`} fwd color={LEAK} size={2} gap={6} speed={0.45} delay={0.05 + j * 0.1} />
                  </g>
                )),
              )}
            {/* tiny discharges inside the main gap at high voltage */}
            {limbs.map((cx) => (
              <Spark key={cx} a={[cx - 26, 254]} b={[cx - 18, 258]} active={live && level > 0.6} intensity={level * 0.6} amp={2} width={0.8} color={LEAK} />
            ))}
          </LoadLossTransformer>

          {/* shorting links over the bushing studs */}
          <ShortingLink xs={hvXs} y={hvTop - 16} label="HV SHORTED" />
          <ShortingLink xs={lvXs} y={lvLinkY} label="LV SHORTED · EARTHED" earth />

          {/* small arcs jumping on the LV side */}
          {lvXs.map((x, k) => (
            <g key={x}>
              <Spark a={[x, lvTop - 4]} b={[x + (k % 2 ? 9 : -9), lvTop + 24]} active={live && level > 0.3} intensity={level} amp={4} width={1.1} color={LEAK} />
              <Spark a={[x + 6, lvTop + 12]} b={[x - 6, lvTop + 36]} active={live && level > 0.75} intensity={level} amp={3} width={0.9} color={LEAK} />
            </g>
          ))}
          {lvXs.slice(0, -1).map((x, k) => (
            <Spark key={`gap${x}`} a={[x + 4, lvTop + 4]} b={[lvXs[k + 1] - 4, lvTop + 8]} active={live && level > 0.5} intensity={level * 0.8} amp={5} width={1} color={LEAK} />
          ))}
          <Spark a={[B.x + B.w - 10, B.y + B.h + 2]} b={[B.x + B.w - 2, B.y + B.h + 18]} active={live && level > 0.4} intensity={level} amp={3} width={1} color={LEAK} />
        </g>
        <text x={412} y={371} textAnchor="middle" className={cn('font-mono text-[13px] font-bold', live ? 'fill-amber' : 'fill-fg-muted')}>
          {phase === 'connect'
            ? 'SHORTING HV · SHORTING + EARTHING LV'
            : live
              ? phase === 'hold'
                ? `HOLDING ${plan.testKv} kV · ${Math.floor(reading?.holdS ?? 0)} / ${plan.holdS} s`
                : phase === 'down'
                  ? 'RAMPING DOWN'
                  : `RAISING · ${kv.toFixed(1)} kV`
              : ''}
        </text>
      </g>
    </svg>
  );
}

/** Leakage bar (0 … trip level) with the test level written beside it. */
function LeakageMeter({ plan, leak, live }: { plan: ReturnType<typeof avtPlan>; leak: number; live: boolean }) {
  const x0 = 24;
  const w = 316;
  const y = 42;
  const f = Math.min(1, leak / AVT_TRIP_MA);
  const marker: Pt = [x0 + w * f, y];
  return (
    <g>
      <text x={x0} y={22} className="fill-accent font-mono text-[11.5px] font-semibold">
        LEAKAGE TO EARTH
      </text>
      <text x={x0 + w} y={22} textAnchor="end" className={cn('font-mono text-[13px] font-bold', live ? 'fill-[#4da3ff]' : 'fill-fg-dim')}>
        {leak.toFixed(2)} mA
      </text>
      <rect x={x0} y={y} width={w} height={14} rx={7} fill="var(--viz-track)" stroke="var(--viz-stem)" />
      <rect x={x0} y={y} height={14} rx={7} fill="#4da3ff" width={Math.max(0.001, w * f)} />
      <rect x={x0 + w * 0.8} y={y} width={w * 0.2} height={14} fill="var(--color-fault)" fillOpacity="0.25" />
      <polygon points={`${marker[0]},${y - 3} ${marker[0] - 6},${y - 12} ${marker[0] + 6},${y - 12}`} fill="#4da3ff" />
      <text x={x0} y={y + 30} className="fill-fg-dim font-mono text-[10px]">
        0
      </text>
      <text x={x0 + w} y={y + 30} textAnchor="end" className="fill-fault font-mono text-[10px]">
        TRIP {AVT_TRIP_MA} mA
      </text>
      <text x={x0} y={y + 52} className="fill-fg-muted font-mono text-[10px]">
        {plan.testKv} kV for Um {plan.um} kV · {plan.holdS} s · {plan.hz} Hz · IEC 60076-3
      </text>
    </g>
  );
}
