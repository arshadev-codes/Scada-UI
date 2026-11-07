import { motion, useReducedMotion } from 'framer-motion';
import { useId } from 'react';
import { cn } from '@/lib/format';
import { toNumber } from '@/lib/electrical';
import type { TestObject } from '@/store/types';
import { parseVectorGroup } from '@/tests/shared/transformer';
import { LL, LoadLossDefs, LoadLossTransformer, SupplyBox, bushingIdx, busRuns, lvTop, type CoilState } from '@/tests/shared/LoadLossTransformer';
import { BENCH, ShortingLink, SourceRack, XF } from '@/tests/shared/HvBench';
import { Flow } from '@/tests/shared/Wiring';
import { HEAT_MAX, HEAT_MIN, HEAT_STOPS, heatColor } from './heatColor';
import { TRT_LIMITS, TRT_STABLE_K_PER_H, trtPlan, type TrtReading, type TrtTemps } from './runTemperatureRiseTest';

/** Temperature tag positions (frame coords) and the point each one reads. */
const PROBES: Array<{ key: keyof TrtTemps; label: string; y: number; to: [number, number] }> = [
  { key: 'topOil', label: 'TOP OIL', y: 150, to: [530, 214] },
  { key: 'hvWdg', label: 'HV WINDING', y: 192, to: [521, 246] },
  { key: 'lvWdg', label: 'LV WINDING', y: 234, to: [506, 272] },
  { key: 'bottomOil', label: 'BOTTOM OIL', y: 276, to: [530, 306] },
];

/**
 * Heat run on the bench: variac → CT → HV box, LV shorted at its bushings.
 * Windings, oil and radiators are painted with a thermal palette that follows
 * the live temperatures — oil hotter at the top than the bottom, windings
 * hotter than the oil — while oil convection circulates through the tank and
 * radiators and heat shimmers off the cover.
 */
export function HeatRunVisual({ o, reading }: { o: TestObject; reading: TrtReading | null }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${uid}-${n}`;
  const reduce = useReducedMotion();
  const plan = trtPlan(o);
  const vg = parseVectorGroup(o.vectorGroup);
  const single = o.phases === '1';
  const hvIdx = bushingIdx(single, vg.hv.neutral);
  const lvIdx = bushingIdx(single, vg.lv.neutral);

  const phase = reading?.phase ?? null;
  const running = phase !== null && phase !== 'done';
  const live = running && phase !== 'connect';
  const amb = reading?.ambient ?? plan.ambient;
  const T: TrtTemps = reading ?? { ambient: amb, topOil: amb, bottomOil: amb, hvWdg: amb, lvWdg: amb };
  const currentA = live ? (reading?.currentA ?? 0) : 0;
  const rise = Math.max(0, T.topOil - T.ambient);
  const heat = Math.min(1, rise / 50);

  // variac output ≈ impedance voltage at the test current
  const hvV = (toNumber(o.hvVoltageKv) ?? 11) * 1000;
  const vzRated = (hvV * (toNumber(o.impedancePct) ?? 4.5)) / 100;
  const vz = live ? vzRated * (currentA / plan.ratedA) : 0;
  // through a 0.415 / 1.1 kV supply transformer
  const frac = Math.min(1, vz / 1100);

  const hvRuns = busRuns('HV', hvIdx, single);
  const lvXs = lvIdx.map((i) => LL.LV_XS[i]);
  const coils = (s: CoilState): CoilState[] => [0, 1, 2].map(() => (live ? s : 'idle'));

  return (
    <svg viewBox={`0 0 ${BENCH.w} ${BENCH.h}`} className="w-full rounded-[6px] border border-line bg-ink-850" role="img" aria-label={`Heat run: top oil ${T.topOil.toFixed(1)} °C, HV winding ${T.hvWdg.toFixed(1)} °C`}>
      <LoadLossDefs id={id} />
      <defs>
        <linearGradient id={id('oil')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={heatColor(T.topOil)} stopOpacity="0.62" />
          <stop offset="0.55" stopColor={heatColor((T.topOil + T.bottomOil) / 2)} stopOpacity="0.5" />
          <stop offset="1" stopColor={heatColor(T.bottomOil)} stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id={id('hvw')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={heatColor(T.hvWdg + 6)} />
          <stop offset="1" stopColor={heatColor(T.hvWdg - 7)} />
        </linearGradient>
        <linearGradient id={id('lvw')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={heatColor(T.lvWdg + 5)} />
          <stop offset="1" stopColor={heatColor(T.lvWdg - 6)} />
        </linearGradient>
        <linearGradient id={id('rad')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={heatColor(T.topOil - 2)} />
          <stop offset="1" stopColor={heatColor(T.bottomOil - 3)} />
        </linearGradient>
        <linearGradient id={id('scale')} gradientUnits="userSpaceOnUse" x1="24" x2="340" y1="0" y2="0">
          {HEAT_STOPS.map(([t]) => (
            <stop key={t} offset={(t - HEAT_MIN) / (HEAT_MAX - HEAT_MIN)} stopColor={heatColor(t)} />
          ))}
        </linearGradient>
      </defs>

      <HeatScale T={T} id={id} reading={reading} />

      <SourceRack frac={frac} live={running} variacV={frac * 415} stepUp={{ title: 'SUPPLY XFMR', ratio: `0.415 / 1.1 kV · ${Math.round(vz)} V` }} mainsHz={Number(o.frequency) || 50} />

      <g transform={`translate(${XF.x} ${XF.y}) scale(${XF.s})`}>
        {/* HV: test current in */}
        {hvRuns.map((r) => (
          <g key={r.bi}>
            <path d={r.d} fill="none" stroke={live ? 'var(--viz-amber)' : r.color} strokeOpacity={live ? 1 : 0.75} strokeWidth={live ? 3 : 2.2} strokeLinejoin="round" />
            {live && !reduce && <Flow d={r.d} fwd color="var(--viz-amber-soft)" size={2.6} gap={24} />}
          </g>
        ))}
        <SupplyBox
          side="HV"
          title="HV · CURRENT"
          value={currentA.toFixed(2)}
          unit={`A · ${live ? (reading?.lossKw ?? 0).toFixed(2) : '0.00'} kW`}
          live={live}
          runs={hvRuns}
          note={phase === 'total' ? 'TOTAL LOSSES' : phase === 'rated' ? 'RATED CURRENT' : 'STANDBY'}
        />

        {/* oil-rise-rate box where the LV box usually is */}
        <RateBox reading={reading} live={live} />

        <LoadLossTransformer
          id={id}
          single={single}
          hvIdx={hvIdx}
          lvIdx={lvIdx}
          hvCoils={coils('live')}
          lvCoils={coils('live')}
          hotHv={live ? hvIdx : []}
          hotLv={live ? lvIdx : []}
          live={live}
          oilFill={`url(#${id('oil')})`}
          hvCoilFill={`url(#${id('hvw')})`}
          lvCoilFill={`url(#${id('lvw')})`}
          radiatorFill={`url(#${id('rad')})`}
          caption={`${o.ratedPowerKva || '—'} kVA · ${o.cooling} · ${o.vectorGroup}`}
          hvRole={live ? `${currentA.toFixed(2)} A` : 'SUPPLY · OFF'}
          lvRole="SHORTED"
          behindCoils={live && !reduce ? <Convection T={T} /> : null}
        />

        {/* LV shorting bar */}
        <ShortingLink xs={lvXs} y={lvTop - 16} label="LV SHORTED" />

        {/* oil-temperature pocket on the cover */}
        <rect x={526} y={182} width={8} height={12} rx={2} fill="var(--viz-metal)" />

        {/* heat shimmer off the cover */}
        {live && !reduce && heat > 0.08 &&
          [290, 335, 470, 515].map((x, k) => (
            <motion.path
              key={x}
              d={`M${x} 186 q 6 -8 0 -16 q -6 -8 0 -16 q 6 -8 0 -16`}
              fill="none"
              stroke={heatColor(T.topOil + 10)}
              strokeWidth="2"
              strokeLinecap="round"
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 0.75 * heat, 0], y: [0, -26] }}
              transition={{ duration: 2.2, repeat: Infinity, delay: k * 0.5, ease: 'easeOut' }}
            />
          ))}

        {/* temperature tags with leaders */}
        {PROBES.map((p) => {
          const t = T[p.key];
          return (
            <g key={p.key}>
              <path d={`M600 ${p.y + 16} H580 L${p.to[0]} ${p.to[1]}`} fill="none" stroke="var(--viz-tick-major)" strokeOpacity="0.55" strokeWidth="0.9" strokeDasharray="3 2" />
              <circle cx={p.to[0]} cy={p.to[1]} r={2.6} fill="var(--viz-ink)" stroke="var(--viz-tick-major)" strokeWidth="1" />
              <rect x={600} y={p.y} width={114} height={34} rx={5} fill="var(--viz-box)" stroke="var(--viz-stem)" />
              <motion.rect x={600} y={p.y} width={8} height={34} rx={3} animate={{ fill: heatColor(t) }} transition={{ duration: 0.3 }} />
              <text x={614} y={p.y + 12} className="fill-fg-muted font-mono text-[8.5px] font-semibold">
                {p.label}
              </text>
              <text x={614} y={p.y + 28} className="fill-fg font-mono text-[13px] font-semibold">
                {t.toFixed(1)} °C
              </text>
              <text x={710} y={p.y + 28} textAnchor="end" className="fill-fg-dim font-mono text-[9px]">
                +{Math.max(0, t - T.ambient).toFixed(1)}
              </text>
            </g>
          );
        })}

        <AmbientThermometer t={T.ambient} />
        <text x={412} y={372} textAnchor="middle" className={cn('font-mono text-[13px] font-bold', live ? 'fill-amber' : 'fill-fg-muted')}>
          {phase === 'connect'
            ? 'PROBES IN · LV SHORTED'
            : phase === 'total'
              ? `TOTAL LOSSES · OIL RISE +${rise.toFixed(1)} K`
              : phase === 'rated'
                ? 'RATED CURRENT · WINDING GRADIENT SETTLING'
                : ''}
        </text>
      </g>
    </svg>
  );
}

/** Oil going up beside the windings, out along the top, down the radiators and walls, back in at the bottom. */
function Convection({ T }: { T: TrtTemps }) {
  const up = heatColor(T.topOil + 6);
  const down = heatColor(T.bottomOil);
  return (
    <g opacity="0.85">
      {[371, 453].map((x) => (
        <Flow key={x} d={`M${x} 304 V218`} fwd color={up} size={2.2} gap={12} speed={1.1} />
      ))}
      {[292, 532].map((x) => (
        <Flow key={x} d={`M${x} 218 V304`} fwd color={down} size={2.2} gap={12} speed={1.4} />
      ))}
      {/* radiators: hot oil enters at the top header and sinks as it cools */}
      {[249, 577].map((x) => (
        <Flow key={x} d={`M${x} 214 V318`} fwd color={down} size={2.4} gap={14} speed={1.6} />
      ))}
    </g>
  );
}

function AmbientThermometer({ t }: { t: number }) {
  const x = 205;
  const top = 214;
  const bottom = 322;
  const f = Math.max(0, Math.min(1, t / 50));
  const level = bottom - (bottom - top) * f;
  return (
    <g>
      <rect x={x - 5} y={top} width={10} height={bottom - top + 4} rx={5} fill="var(--viz-track)" stroke="var(--viz-stem)" />
      <rect x={x - 2.5} y={level} width={5} height={bottom + 2 - level} rx={2.5} fill={heatColor(t)} />
      <circle cx={x} cy={bottom + 10} r={9} fill={heatColor(t)} stroke="var(--viz-stem)" />
      {[0, 25, 50].map((v) => (
        <g key={v}>
          <line x1={x + 6} x2={x + 11} y1={bottom - (bottom - top) * (v / 50)} y2={bottom - (bottom - top) * (v / 50)} stroke="var(--viz-tick-minor)" />
          <text x={x + 13} y={bottom - (bottom - top) * (v / 50) + 3} className="fill-fg-dim font-mono text-[7.5px]">
            {v}
          </text>
        </g>
      ))}
      <text x={x} y={top - 18} textAnchor="middle" className="fill-fg-muted font-mono text-[8.5px] font-semibold">
        AMBIENT
      </text>
      <text x={x} y={top - 6} textAnchor="middle" className="fill-fg font-mono text-[11px] font-semibold">
        {t.toFixed(1)} °C
      </text>
    </g>
  );
}

function RateBox({ reading, live }: { reading: TrtReading | null; live: boolean }) {
  const b = LL.BOX_LV;
  const rate = reading?.oilRate ?? 0;
  const stable = live && reading?.phase !== 'connect' && (reading?.min ?? 0) >= 180 && rate < TRT_STABLE_K_PER_H;
  const h = Math.floor((reading?.min ?? 0) / 60);
  const m = Math.floor((reading?.min ?? 0) % 60);
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="6" fill="var(--viz-box)" stroke={live ? 'var(--viz-amber)' : 'var(--viz-violet)'} strokeWidth="1.5" />
      <text x={b.x + 12} y={b.y + 16} className={cn('font-display text-[11px] font-bold tracking-[0.14em]', live ? 'fill-amber' : 'fill-accent-soft')}>
        HEAT RUN
      </text>
      <text x={b.x + 12} y={b.y + 40} className="fill-fg font-mono text-[15px] font-medium">
        {h} h {String(m).padStart(2, '0')} m
      </text>
      <text x={b.x + 12} y={b.y + 56} className="fill-fg-dim font-mono text-[9.5px]">
        oil {rate >= 0 ? '+' : ''}
        {rate.toFixed(2)} K/h
      </text>
      <text x={b.x + 12} y={b.y + 70} className={cn('font-mono text-[8.5px] font-semibold', stable ? 'fill-ok' : live ? 'fill-amber' : 'fill-fg-muted')}>
        {stable ? `STABLE < ${TRT_STABLE_K_PER_H} K/h ✓` : live ? 'RISING' : 'STANDBY'}
      </text>
    </g>
  );
}

/** Thermal palette with a marker for each reading and the rise limits. */
function HeatScale({ T, id, reading }: { T: TrtTemps; id: (n: string) => string; reading: TrtReading | null }) {
  const x0 = 24;
  const w = 316;
  const y = 44;
  const pos = (t: number) => x0 + w * Math.max(0, Math.min(1, (t - HEAT_MIN) / (HEAT_MAX - HEAT_MIN)));
  const marks: Array<[string, number]> = [
    ['O', T.topOil],
    ['H', T.hvWdg],
    ['L', T.lvWdg],
  ];
  const limits: Array<[string, number]> = [
    ['OIL LIMIT', T.ambient + TRT_LIMITS.topOil],
    ['WDG LIMIT', T.ambient + TRT_LIMITS.winding],
  ];
  return (
    <g>
      <text x={x0} y={18} className="fill-accent font-mono text-[11.5px] font-semibold">
        THERMAL SCALE · °C
      </text>
      <text x={x0 + w} y={18} textAnchor="end" className="fill-fg-dim font-mono text-[10px]">
        {reading && reading.phase !== 'connect' ? `${reading.min.toFixed(0)} min` : ''}
      </text>
      <rect x={x0} y={y} width={w} height={12} rx={6} fill={`url(#${id('scale')})`} />
      {limits.map(([label, t], k) => (
        <g key={label}>
          <line x1={pos(t)} x2={pos(t)} y1={y - 2} y2={y + 30 + k * 10} stroke="var(--color-fault)" strokeWidth="1.2" strokeDasharray="2 2" />
          <text x={pos(t) + 3} y={y + 34 + k * 10} className="fill-fault font-mono text-[8.5px]">
            {label}
          </text>
        </g>
      ))}
      {marks.map(([k, t], j) => (
        <g key={k} transform={`translate(${pos(t).toFixed(1)} 0)`} style={{ transition: 'transform 0.3s' }}>
          <polygon points={`0,${y - 2} -5,${y - 10} 5,${y - 10}`} fill={heatColor(t)} stroke="var(--viz-ink)" strokeWidth="0.8" />
          <text x={(j - 1) * 9} y={y - 13} textAnchor="middle" className="fill-fg font-mono text-[9px] font-bold">
            {k}
          </text>
        </g>
      ))}
      {[20, 40, 60, 80, 100].map((t) => (
        <text key={t} x={pos(t)} y={y + 24} textAnchor="middle" className="fill-fg-dim font-mono text-[8.5px]">
          {t}
        </text>
      ))}
      <text x={x0} y={y + 58} className="fill-fg-muted font-mono text-[9.5px]">
        O top oil · H HV winding · L LV winding · limits = ambient + {TRT_LIMITS.topOil} / {TRT_LIMITS.winding} K
      </text>
    </g>
  );
}
