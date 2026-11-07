/**
 * Winding Resistance test.
 *
 *   1. Pulse START — the resistance meter injects DC into HV pair 1
 *   2. The reading falls while the winding inductance charges, then settles
 *   3. The PLC stores the settled value (HV_1 … LV_3) and moves to the next pair
 *   4. Finished when the PLC sets COMPLETE
 *
 * While WRM_TAGS has empty addresses, DEMO data is played instead, through the
 * same callbacks, so the screen looks exactly as it will with the real meter.
 */
import type { TestObject } from '@/store/types';
import { createRunControl, jitter, READ_EVERY_MS, tagsReady } from '@/tests/shared/runtime';
import { demoCurrents, terminalPairs } from '@/tests/shared/transformer';
import { toNumber } from '@/lib/electrical';
import { WRM_TAGS, type WrmTagName } from './tags';
import { calculateWindingResistance, correctTo75, formatOhms, type WrmResult } from './calculation';

export interface WrmMeasurement {
  side: 'HV' | 'LV';
  pair: string;
}

export interface WrmReading {
  /** Index into the measurement list being measured now, null between / after */
  active: number | null;
  /** Live (still settling) resistance of the active pair, Ω */
  liveR: number;
  /** Meter current now / target, A */
  current: number;
  setCurrent: number;
  /** 0 → 1 as the reading settles */
  settle: number;
  /** Settled value of each measurement, null until measured */
  values: Array<number | null>;
  tempC: number;
  /** Kelvin leads being connected at the start */
  connecting?: boolean;
  /** Leads moving to the next pair (no current yet) */
  moving?: boolean;
  /** Meter discharging the winding after a reading */
  discharging?: boolean;
}

export interface WrmCallbacks {
  log?: (msg: string) => void;
  onReading?: (r: WrmReading) => void;
}

const run = createRunControl();
const CONNECT_MS = 3200; // leads connected before the first pair
const MOVE_MS = 1100; // leads moved to the next pair
const DISCHARGE_MS = 1300; // winding discharged after a reading
export const stopWindingResistanceTest = () => run.stop();

/** True when every WRM address is filled in, i.e. the real PLC is read. */
export const wrmUsesPlc = () => tagsReady(WRM_TAGS);

export function wrmMeasurements(o: TestObject): WrmMeasurement[] {
  return [
    ...terminalPairs(o, 'HV').map((pair) => ({ side: 'HV' as const, pair })),
    ...terminalPairs(o, 'LV').map((pair) => ({ side: 'LV' as const, pair })),
  ];
}

/** Meter test current: about 10 % of rated, capped like a typical 10 A / 25 A meter. */
export function wrmTestCurrent(o: TestObject, side: 'HV' | 'LV'): number {
  const c = demoCurrents(o);
  const i = side === 'HV' ? Math.min(10, c.hv * 0.1) : Math.min(25, c.lv * 0.1);
  return Math.max(0.5, Math.round(i * 10) / 10);
}

export async function runWindingResistanceTest(o: TestObject, cb: WrmCallbacks = {}): Promise<WrmResult> {
  const log = cb.log ?? console.log;
  run.reset();
  const list = wrmMeasurements(o);
  const values: Array<number | null> = list.map(() => null);
  let tempC = toNumber(o.ambientTempC) ?? 30;

  try {
    cb.onReading?.({ active: null, liveR: 0, current: 0, setCurrent: 0, settle: 0, values: [...values], tempC, connecting: true });
    log('Connecting HV and LV supply to the transformer');
    await run.sleep(CONNECT_MS);
    if (wrmUsesPlc()) tempC = await fromPlc(list, values, cb, log);
    else await demo(o, list, values, tempC, cb, log);

    const pick = (side: 'HV' | 'LV') => list.map((m, i) => (m.side === side ? (values[i] ?? 0) : null)).filter((x): x is number => x !== null);
    const result = calculateWindingResistance({
      tempC,
      hv: { pairs: list.filter((m) => m.side === 'HV').map((m) => m.pair), r: pick('HV'), material: o.windingHv },
      lv: { pairs: list.filter((m) => m.side === 'LV').map((m) => m.pair), r: pick('LV'), material: o.windingLv },
    });
    log(`Imbalance at 75 °C · HV ${result.hv.imbalancePct.toFixed(2)} % · LV ${result.lv.imbalancePct.toFixed(2)} %`);
    return result;
  } catch (error) {
    // Stopped: drop the live state so the drawing stops showing current; keep measured values.
    cb.onReading?.({ active: null, liveR: 0, current: 0, setCurrent: 0, settle: 0, values: [...values], tempC });
    log(`Test stopped: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

/** Real meter: values come from the PLC; a pair is done when its register is non-zero. */
async function fromPlc(
  list: WrmMeasurement[],
  values: Array<number | null>,
  cb: WrmCallbacks,
  log: (m: string) => void,
): Promise<number> {
  const slots: WrmTagName[] = ['HV_1', 'HV_2', 'HV_3', 'LV_1', 'LV_2', 'LV_3'];
  const hvCount = list.filter((m) => m.side === 'HV').length;
  // A single-phase list is [HV, LV] → HV_1, LV_1
  const slotOf = list.map((m, i) => (m.side === 'HV' ? slots[i] : slots[3 + i - hvCount]));

  log('START sent to PLC');
  await run.pulse(WRM_TAGS.START);
  let tempC = 0;
  for (;;) {
    run.check();
    const [temp, current, live, complete, ...rs] = await run.read(WRM_TAGS, ['TEMP', 'CURRENT', 'LIVE', 'COMPLETE', ...slotOf]);
    tempC = temp;
    rs.forEach((r, i) => {
      if (r > 0 && values[i] === null) {
        values[i] = r;
        const f = formatOhms(r);
        log(`${list[i].side} ${list[i].pair} = ${f.value} ${f.unit}`);
      }
    });
    const next = values.findIndex((v) => v === null);
    const active = next < 0 ? null : next;
    cb.onReading?.({ active, liveR: live, current, setCurrent: current, settle: 0, values: [...values], tempC });
    if (complete) break;
    await run.sleep(READ_EVERY_MS);
  }
  log('PLC reports WRM complete');
  return tempC;
}

/**
 * Demo: realistic values from the guaranteed load loss. Half the copper loss
 * is in each winding:  line–line pair  P = 1.5 · I² · R,  line–neutral  P = 3 · I² · R.
 */
async function demo(
  o: TestObject,
  list: WrmMeasurement[],
  values: Array<number | null>,
  tempC: number,
  cb: WrmCallbacks,
  log: (m: string) => void,
) {
  const kva = toNumber(o.ratedPowerKva) ?? 100;
  const loss75 = toNumber(o.guaranteedLoadLossW) ?? kva * 12;
  const c = demoCurrents(o);
  const nominal = (m: WrmMeasurement) => {
    const i = m.side === 'HV' ? c.hv : c.lv;
    const factor = o.phases === '1' ? 1 : m.pair.includes('N') || m.pair.includes('n') ? 3 : 1.5;
    const r75 = loss75 / 2 / (factor * i * i);
    // back from 75 °C to the winding temperature (inverse of correctTo75)
    return r75 / (correctTo75(1, tempC, m.side === 'HV' ? o.windingHv : o.windingLv));
  };

  log(`DEMO · winding temperature ${tempC} °C · START`);
  const STEP_MS = 120;
  for (let n = 0; n < list.length; n++) {
    const m = list[n];
    const target = nominal(m) * (1 + jitter(0.006));
    const setI = wrmTestCurrent(o, m.side);
    const tauI = m.side === 'HV' ? 0.9 : 0.6; // s, winding L/R as seen by the meter
    // move the Kelvin leads onto this pair
    cb.onReading?.({ active: n, liveR: 0, current: 0, setCurrent: setI, settle: 0, values: [...values], tempC, moving: true });
    await run.sleep(MOVE_MS);
    log(`${m.side} ${m.pair} · injecting ${setI} A DC`);

    for (let t = 0; ; t += STEP_MS / 1000) {
      run.check();
      const current = setI * (1 - Math.exp(-t / tauI));
      const liveR = target * (1 + 2.2 * Math.exp(-t / (tauI * 0.8))) * (1 + jitter(0.0004));
      const settle = Math.min(1, t / (tauI * 5));
      cb.onReading?.({ active: n, liveR, current, setCurrent: setI, settle, values: [...values], tempC });
      if (settle >= 1) break;
      await run.sleep(STEP_MS);
    }
    values[n] = target;
    const f = formatOhms(target);
    log(`${m.side} ${m.pair} = ${f.value} ${f.unit} · settled`);
    cb.onReading?.({ active: n, liveR: target, current: setI, setCurrent: setI, settle: 1, values: [...values], tempC });
    // the meter discharges the winding's stored energy before the leads move on
    for (let t = 0; t < DISCHARGE_MS; t += STEP_MS) {
      run.check();
      cb.onReading?.({ active: n, liveR: target, current: setI * Math.exp(-t / 300), setCurrent: setI, settle: 1, values: [...values], tempC, discharging: true });
      await run.sleep(STEP_MS);
    }
  }
  cb.onReading?.({ active: null, liveR: 0, current: 0, setCurrent: 0, settle: 0, values: [...values], tempC });
  log('DEMO · all pairs measured');
}
