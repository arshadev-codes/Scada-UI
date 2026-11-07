import { motion, useReducedMotion } from 'framer-motion';
import { useId } from 'react';
import { cn } from '@/lib/format';
import type { TestObject } from '@/store/types';
import { parseVectorGroup } from '@/tests/shared/transformer';
import { LoadLossDefs, LoadLossTransformer, SupplyBox, bushingIdx, busRuns, type CoilState } from '@/tests/shared/LoadLossTransformer';
import { WindingDiagram, pairCoils, pairTerminals, windingGeometry } from '@/tests/shared/WindingDiagram';
import { formatOhms } from './calculation';
import type { WrmMeasurement, WrmReading } from './runWindingResistanceTest';

// ── Geometry (viewBox 1222 × 470) ──────────────────────────────────────────
/** Where the load-loss transformer frame (720 × 360) sits; drawn 1.2× so it reads as large as on the load-loss screen. */
const XF = { x: -5, y: 10, s: 1.2 };
const METER = { x: 868, y: 24, w: 340, h: 404 };

/** Bushing index of a terminal label ("R", "y", "1.1", …): 0 1 2 = phases, 3 = neutral. */
const BUSHING: Record<string, number> = { R: 0, Y: 1, B: 2, N: 3, r: 0, y: 1, b: 2, n: 3, '1.1': 0, '1.2': 2, '2.1': 0, '2.2': 2 };

/**
 * Winding resistance on the bench, drawn with the same transformer as the
 * load-loss screen: HV DC supply on the left end, LV DC supply on the right
 * end, bus conductors to every bushing. The measured pair's conductors carry
 * the DC, the coils it flows through light up in the cutaway. The meter stands
 * alone and only shows the readings.
 */
export function WrmVisual({ o, list, reading }: { o: TestObject; list: WrmMeasurement[]; reading: WrmReading | null }) {
  const uid = useId().replace(/:/g, '');
  const id = (n: string) => `${uid}-${n}`;
  const reduce = useReducedMotion();
  const vg = parseVectorGroup(o.vectorGroup);
  const single = o.phases === '1';

  const connecting = !!reading?.connecting;
  const idx = reading?.active ?? (connecting ? 0 : null);
  const m = idx !== null ? list[idx] : null;
  const connected = idx !== null;
  const sideIdx = m ? list.filter((x) => x.side === m.side).indexOf(m) : 0;
  const info = m ? (m.side === 'HV' ? vg.hv : vg.lv) : vg.hv;
  const [ta, tb] = m ? pairTerminals(info, single, m.side, sideIdx) : ['R', 'Y'];
  const biA = BUSHING[ta] ?? 0;
  const biB = BUSHING[tb] ?? 2;
  const current = reading?.current ?? 0;
  const flowing = connected && !connecting && !reading?.moving && !reading?.discharging && current > 0.02;
  const discharging = !!reading?.discharging;
  const held = (reading?.settle ?? 0) >= 1 && !discharging;
  const energised = flowing || discharging;

  const hvIdx = bushingIdx(single, vg.hv.neutral);
  const lvIdx = bushingIdx(single, vg.lv.neutral);
  const coils = m ? pairCoils(info, single, sideIdx) : { main: [], parallel: [] };
  const coilStates = (side: 'HV' | 'LV'): CoilState[] =>
    [0, 1, 2].map((k) => (!energised || m?.side !== side ? 'idle' : coils.main.includes(k) ? 'live' : coils.parallel.includes(k) ? 'induced' : 'idle'));
  const hot = (side: 'HV' | 'LV') => (energised && m?.side === side ? [biA, biB] : []);
  const pairLabel = m ? `${m.side} ${m.pair}` : '';

  return (
    <svg viewBox="0 0 1222 470" className="w-full rounded-[6px] border border-line bg-ink-850" role="img" aria-label={`Transformer with HV and LV DC supply, measuring ${m ? pairLabel : 'nothing'}`}>
      <LoadLossDefs id={id} />
      <defs>
        <linearGradient id={id('bezel')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--viz-metal)" />
          <stop offset="0.08" stopColor="var(--viz-stem)" />
          <stop offset="1" stopColor="var(--viz-ink)" />
        </linearGradient>
        <linearGradient id={id('glass')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.09" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ── transformer, supplied from both ends (as in load loss) ── */}
      <g transform={`translate(${XF.x} ${XF.y}) scale(${XF.s})`}>
        {(['HV', 'LV'] as const).map((side) => {
          const runs = busRuns(side, side === 'HV' ? hvIdx : lvIdx, single);
          const sideLive = energised && m?.side === side;
          return (
            <g key={side}>
              {runs.map((r) => {
                const onPair = sideLive && (r.bi === biA || r.bi === biB);
                return (
                  <g key={r.bi}>
                    <path d={r.d} fill="none" stroke={r.color} strokeOpacity={onPair ? 1 : 0.75} strokeWidth={onPair ? 3 : 2.2} strokeLinejoin="round" />
                    {onPair && !reduce && (
                      <Pulses d={r.d} dir={(r.bi === biA) !== discharging ? 'out' : 'in'} color={discharging ? '#bfe3ff' : 'var(--viz-amber)'} />
                    )}
                  </g>
                );
              })}
              <SupplyBox
                side={side}
                title={`${side} DC SUPPLY`}
                value={sideLive ? current.toFixed(2) : '0.00'}
                unit="A DC"
                live={sideLive}
                runs={runs}
                note={sideLive ? (discharging ? `DISCH ${m?.pair}` : `ON ${m?.pair}`) : 'STANDBY'}
              />
            </g>
          );
        })}
        <LoadLossTransformer
          id={id}
          single={single}
          hvIdx={hvIdx}
          lvIdx={lvIdx}
          hvCoils={coilStates('HV')}
          lvCoils={coilStates('LV')}
          hotHv={hot('HV')}
          hotLv={hot('LV')}
          live={energised}
          caption={`${o.hvVoltageKv || '—'} kV / ${o.lvVoltageV || '—'} V · ${o.vectorGroup}`}
          hvRole={m?.side === 'HV' ? (discharging ? 'DISCHARGING' : flowing ? `DC ON ${m.pair}` : 'CONNECTED') : 'SUPPLY · STANDBY'}
          lvRole={m?.side === 'LV' ? (discharging ? 'DISCHARGING' : flowing ? `DC ON ${m.pair}` : 'CONNECTED') : 'SUPPLY · STANDBY'}
        />
        <text x={412} y={372} textAnchor="middle" className={cn('font-mono text-[13px] font-bold', discharging ? 'fill-[#bfe3ff]' : flowing ? 'fill-amber' : 'fill-fg-muted')}>
          {discharging ? `DISCHARGING ${pairLabel}` : flowing ? `DC ${current.toFixed(2)} A · ${pairLabel}` : m ? `CONNECTED ${pairLabel}` : ''}
        </text>
      </g>

      {/* ── meter ───────────────────────────────────── */}
      <MicroOhmMeter
        idOf={id}
        o={o}
        list={list}
        reading={reading}
        m={m}
        sideIdx={sideIdx}
        flowing={flowing}
        held={held}
        discharging={discharging}
        connecting={connecting}
      />
    </svg>
  );
}

/** Moving pulses along a lead: out of the meter to terminal A, back into it from terminal B. */
function Pulses({ d, dir, color }: { d: string; dir: 'out' | 'in'; color: string }) {
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      pathLength={1}
      strokeDasharray="0.04 0.1"
      animate={{ strokeDashoffset: dir === 'out' ? [0, -0.14] : [0, 0.14] }}
      transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
    />
  );
}

/** The micro-ohmmeter: bezel, nameplate + LEDs, glass display with mini winding diagram, all pair results. */
function MicroOhmMeter({
  idOf,
  o,
  list,
  reading,
  m,
  sideIdx,
  flowing,
  held,
  discharging,
  connecting,
}: {
  idOf: (n: string) => string;
  o: TestObject;
  list: WrmMeasurement[];
  reading: WrmReading | null;
  m: WrmMeasurement | null;
  sideIdx: number;
  flowing: boolean;
  held: boolean;
  discharging: boolean;
  connecting: boolean;
}) {
  const { x, y, w, h } = METER;
  const single = o.phases === '1';
  const vg = parseVectorGroup(o.vectorGroup);
  const live = formatOhms(m && !reading?.moving && !connecting ? reading?.liveR : null);
  const settle = reading?.settle ?? 0;
  const disp = { x: x + 18, y: y + 88, w: w - 36, h: 150 };
  const leds: Array<[string, boolean, string, boolean]> = [
    ['DC OUT', flowing, 'var(--viz-amber)', false],
    ['SETTLING', flowing && settle < 1, 'var(--color-phase-b)', true],
    ['HOLD', held && !!m && settle >= 1, 'var(--color-ok)', false],
    ['DISCH', discharging, '#bfe3ff', true],
  ];
  // mini winding diagram of the side being measured, current path lit
  const info = m ? (m.side === 'HV' ? vg.hv : vg.lv) : vg.hv;
  const geo = windingGeometry(info, single, m?.side ?? 'HV', 0, 0, 30);
  const coils = m ? pairCoils(info, single, sideIdx) : { main: [], parallel: [] };
  const hvRows = list.map((r, i) => ({ r, i })).filter((x) => x.r.side === 'HV');
  const lvRows = list.map((r, i) => ({ r, i })).filter((x) => x.r.side === 'LV');

  return (
    <g>
      <rect x={x + 4} y={y + 8} width={w} height={h} rx={14} fill="#000" fillOpacity="0.35" />
      <rect x={x} y={y} width={w} height={h} rx={14} fill={`url(#${idOf('bezel')})`} stroke={flowing ? 'var(--viz-amber)' : 'var(--viz-metal)'} strokeWidth="1.6" />
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

      {/* nameplate */}
      <rect x={x + 28} y={y + 24} width={w - 56} height={30} rx={3} fill="var(--color-plate)" />
      <line x1={x + 28} x2={x + w - 28} y1={y + 54} y2={y + 54} stroke="var(--color-accent)" strokeWidth="2" />
      <text x={x + w / 2} y={y + 44} textAnchor="middle" fill="var(--color-plate-fg)" className="font-display text-[13px] font-semibold tracking-[0.1em]">
        MICRO-OHMMETER · 4-WIRE
      </text>
      {/* status LEDs, own row under the nameplate */}
      {leds.map(([label, lit, color, blink], k) => {
        const cx = x + 52 + k * ((w - 104) / 3);
        const cy = y + 70;
        return (
          <g key={label}>
            {lit && !blink && <circle cx={cx - 22} cy={cy} r={9} fill={color} opacity="0.25" />}
            {lit && blink ? (
              <motion.circle cx={cx - 22} cy={cy} r={5} fill={color} animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.6, repeat: Infinity }} />
            ) : (
              <circle cx={cx - 22} cy={cy} r={5} fill={lit ? color : 'var(--viz-tick-minor)'} />
            )}
            <text x={cx - 13} y={cy + 3.5} className={cn('font-mono text-[9.5px]', lit ? 'fill-fg' : 'fill-fg-dim')}>
              {label}
            </text>
          </g>
        );
      })}

      {/* glass display */}
      <rect x={disp.x} y={disp.y} width={disp.w} height={disp.h} rx={8} fill="var(--viz-track)" stroke="var(--viz-stem)" strokeWidth="1.5" />
      <text x={disp.x + 16} y={disp.y + 22} className="fill-fg-muted font-mono text-[12px]">
        {connecting ? 'CONNECTING' : m ? `${m.side} ${m.pair}` : 'READY'}
        {m && reading?.moving ? ' · SWITCHING' : ''}
      </text>
      <text x={disp.x + 16} y={disp.y + 74} className="font-mono text-[44px] font-semibold" fill="var(--viz-tick-minor)" fillOpacity="0.3">
        888.88
      </text>
      <text x={disp.x + 16} y={disp.y + 74} className={cn('font-mono text-[44px] font-semibold', held ? 'fill-ok' : live.value !== '—' ? 'fill-fg' : 'fill-fg-dim')}>
        {live.value !== '—' ? live.value : '---.--'}
      </text>
      <text x={disp.x + 180} y={disp.y + 74} className="fill-fg-muted font-mono text-[18px] font-semibold">
        {live.unit}
      </text>
      {/* settle bar */}
      <rect x={disp.x + 16} y={disp.y + 90} width={160} height={6} rx={3} fill="var(--viz-ink)" />
      <motion.rect x={disp.x + 16} y={disp.y + 90} height={6} rx={3} fill={held ? 'var(--color-ok)' : 'var(--viz-amber)'} animate={{ width: 160 * (m && !reading?.moving ? settle : 0) }} transition={{ duration: 0.15 }} />
      <text x={disp.x + 16} y={disp.y + 116} className="fill-fg-dim font-mono text-[12px]">
        I {(reading?.current ?? 0).toFixed(2)} / {(reading?.setCurrent ?? 0).toFixed(1)} A DC
      </text>
      <text x={disp.x + 16} y={disp.y + 136} className="fill-fg-dim font-mono text-[12px]">
        T {reading ? `${reading.tempC.toFixed(1)} °C` : '—'} {held ? '· HOLD' : discharging ? '· DISCHARGING' : ''}
      </text>
      {/* mini winding diagram */}
      <g transform={`translate(${disp.x + disp.w - 56} ${disp.y + 76})`}>
        <WindingDiagram geo={geo} label={`${m?.side ?? 'HV'} ${single ? '1-PH' : info.connection === 'D' ? 'DELTA' : 'STAR'}`} main={coils.main} parallel={coils.parallel} flowing={flowing} />
      </g>
      <rect x={disp.x} y={disp.y} width={disp.w} height={disp.h} rx={8} fill={`url(#${idOf('glass')})`} pointerEvents="none" />

      {/* every pair's result: HV left, LV right */}
      {[hvRows, lvRows].map((rows, col) => (
        <g key={col}>
          <text x={x + 24 + col * 156} y={y + 262} className="fill-accent font-mono text-[12px] font-semibold">
            {col === 0 ? 'HV WINDING' : 'LV WINDING'}
          </text>
          {rows.map(({ r, i }, k) => {
            const v = reading?.values[i] ?? null;
            const f = formatOhms(v);
            const active = reading?.active === i && v === null;
            const ry = y + 274 + k * 34;
            return (
              <g key={i}>
                <rect x={x + 18 + col * 156} y={ry} width={148} height={28} rx={4} fill="var(--viz-track)" stroke={active ? 'var(--viz-amber)' : 'none'} />
                <text x={x + 28 + col * 156} y={ry + 19} className={cn('font-mono text-[13px] font-semibold', active ? 'fill-amber' : 'fill-fg')}>
                  {r.pair}
                </text>
                <text x={x + 158 + col * 156} y={ry + 19} textAnchor="end" className={cn('font-mono text-[13px]', v !== null ? 'fill-ok font-semibold' : active ? 'fill-amber' : 'fill-fg-dim')}>
                  {v !== null ? `${f.value} ${f.unit} ✓` : active ? 'measuring…' : '—'}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}
