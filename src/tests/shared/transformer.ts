/**
 * What the instrument tests need to know about the transformer, worked out
 * from the Test Object: winding connections, terminal pairs, tap voltages.
 */
import type { TestObject } from '@/store/types';
import { ratedCurrents, toNumber } from '@/lib/electrical';

export type Connection = 'D' | 'Y' | 'Z' | 'I';

export interface WindingInfo {
  connection: Connection;
  /** Neutral brought out (YN, yn, zn) */
  neutral: boolean;
}

export interface VectorGroup {
  hv: WindingInfo;
  lv: WindingInfo;
  /** Clock number: LV lags HV by clock × 30° */
  clock: number;
}

/** "Dyn11" → HV delta, LV star with neutral, 11 o'clock. Falls back to Dyn11. */
export function parseVectorGroup(vg: string): VectorGroup {
  const m = /^([DYZI])(N?)([dyzi])(n?)(\d{1,2})$/i.exec(vg.trim());
  if (!m) return { hv: { connection: 'D', neutral: false }, lv: { connection: 'Y', neutral: true }, clock: 11 };
  return {
    hv: { connection: m[1].toUpperCase() as Connection, neutral: m[2].toUpperCase() === 'N' },
    lv: { connection: m[3].toUpperCase() as Connection, neutral: m[4].toLowerCase() === 'n' },
    clock: Number(m[5]) % 12,
  };
}

/**
 * Terminal pairs a resistance meter is connected across, per side.
 * Star with neutral → line to neutral; otherwise line to line.
 */
export function terminalPairs(o: TestObject, side: 'HV' | 'LV'): string[] {
  if (o.phases === '1') return side === 'HV' ? ['1.1–1.2'] : ['2.1–2.2'];
  const w = parseVectorGroup(o.vectorGroup)[side === 'HV' ? 'hv' : 'lv'];
  const [a, b, c] = side === 'HV' ? ['R', 'Y', 'B'] : ['r', 'y', 'b'];
  const n = side === 'HV' ? 'N' : 'n';
  return w.neutral ? [`${a}–${n}`, `${b}–${n}`, `${c}–${n}`] : [`${a}–${b}`, `${b}–${c}`, `${c}–${a}`];
}

export interface TapInfo {
  /** 1-based tap number */
  tap: number;
  /** HV voltage change at this tap, % (tap 1 = highest voltage) */
  pct: number;
  nominal: boolean;
}

/** Every tap position. No tap changer → one "normal" position at 0 %. */
export function tapPositions(o: TestObject): TapInfo[] {
  const count = Math.round(toNumber(o.tapCount) ?? 1);
  if (o.tapChanger === 'NONE' || count < 2) return [{ tap: 1, pct: 0, nominal: true }];
  const max = toNumber(o.tapMaxPct) ?? 5;
  const min = toNumber(o.tapMinPct) ?? -10;
  const step = (max - min) / (count - 1);
  const nominal = Math.round(toNumber(o.nominalTap) ?? 1);
  return Array.from({ length: count }, (_, i) => ({ tap: i + 1, pct: max - i * step, nominal: i + 1 === nominal }));
}

/** Rated HV / LV line voltages in volts (0 when not entered). */
export function ratedVoltages(o: TestObject): { hv: number; lv: number } {
  return { hv: (toNumber(o.hvVoltageKv) ?? 0) * 1000, lv: toNumber(o.lvVoltageV) ?? 0 };
}

/** Rated currents, with a 100 kVA / 11 kV / 440 V fallback so demo data is never empty. */
export function demoCurrents(o: TestObject): { hv: number; lv: number } {
  const c = ratedCurrents(o);
  return { hv: c.hv ?? 5.25, lv: c.lv ?? 131 };
}
