/**
 * Applied Voltage (separate-source AC withstand) test, IEC 60076-3.
 *
 *   1. All HV terminals are shorted together and connected to the HV test set;
 *      all LV terminals are shorted together and earthed, together with the tank
 *   2. The test voltage for the HV insulation level is raised (11 kV class, Um 12 kV → 28 kV)
 *   3. Held for 60 s at rated frequency
 *   4. Ramped down. PASS when there was no flash-over and the leakage current to
 *      earth stayed steady (no sudden jump) and under the test set's trip level
 *
 * The leakage that flows through the HV → LV / earth insulation is mainly
 * capacitive; it returns through the earthed LV winding and tank to earth.
 */
import type { TestObject } from '@/store/types';
import { createRunControl, jitter, READ_EVERY_MS, tagsReady } from '@/tests/shared/runtime';
import { toNumber } from '@/lib/electrical';
import { AVT_TAGS } from './tags';

export type AvtPhase = 'connect' | 'ramp' | 'hold' | 'down' | 'done';

export interface AvtRow {
  id: number;
  t: number;
  kv: number;
  leakMa: number;
  note: string;
}

export interface AvtReading {
  phase: AvtPhase;
  kv: number;
  leakMa: number;
  holdS: number;
  rows: AvtRow[];
}

export interface AvtResult {
  testKv: number;
  holdS: number;
  leakStart: number;
  leakEnd: number;
  leakMax: number;
  pass: boolean;
  rows: AvtRow[];
}

export interface AvtCallbacks {
  log?: (msg: string) => void;
  onReading?: (r: AvtReading) => void;
}

/** HV test set: 415 V primary → 50 kV. */
export const AVT_SET = { lvV: 415, hvKv: 50 };
/** The test set trips above this leakage. */
export const AVT_TRIP_MA = 50;
/** A jump of more than this between readings during the hold means a partial breakdown. */
export const AVT_JUMP_LIMIT_PCT = 10;

/** Short-duration power-frequency withstand level (IEC 60076-3) for a winding of rated kV. */
export function appliedLevelKv(ratedKv: number): { um: number; kv: number } {
  const table: Array<[number, number]> = [
    [1.1, 3],
    [3.6, 10],
    [7.2, 20],
    [12, 28],
    [17.5, 38],
    [24, 50],
    [36, 70],
    [52, 95],
  ];
  const hit = table.find(([um]) => um >= ratedKv * 1.05) ?? table[table.length - 1];
  return { um: hit[0], kv: hit[1] };
}

const run = createRunControl();
export const stopAppliedVoltageTest = () => run.stop();
export const avtUsesPlc = () => tagsReady(AVT_TAGS);

export function avtPlan(o: TestObject) {
  const ratedKv = toNumber(o.hvVoltageKv) || 11;
  const level = appliedLevelKv(ratedKv);
  return { ratedKv, um: level.um, testKv: level.kv, hz: Number(o.frequency) || 50, holdS: 60 };
}

export const avtVariacV = (kv: number) => (kv / AVT_SET.hvKv) * AVT_SET.lvV;

export async function runAppliedVoltageTest(o: TestObject, cb: AvtCallbacks = {}): Promise<AvtResult> {
  const log = cb.log ?? console.log;
  const plan = avtPlan(o);
  const rows: AvtRow[] = [];
  run.reset();
  const emit = (r: Omit<AvtReading, 'rows'>) => cb.onReading?.({ ...r, rows: [...rows] });
  try {
    emit({ phase: 'connect', kv: 0, leakMa: 0, holdS: 0 });
    log('HV terminals shorted to the test set · LV shorted and earthed · tank earthed');
    await run.sleep(2600);
    const r = avtUsesPlc() ? await fromPlc(plan, rows, emit, log) : await demo(plan, rows, emit, log);
    emit({ phase: 'done', kv: 0, leakMa: 0, holdS: r.holdS });
    return r;
  } catch (error) {
    emit({ phase: 'done', kv: 0, leakMa: 0, holdS: 0 });
    log(`Test stopped: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

type Plan = ReturnType<typeof avtPlan>;
type Emit = (r: Omit<AvtReading, 'rows'>) => void;

function verdict(plan: Plan, rows: AvtRow[], held: number, tripped: boolean): AvtResult {
  const hold = rows.filter((r) => r.note.startsWith('HOLD') || r.note === 'TEST VOLTAGE');
  const leaks = hold.map((r) => r.leakMa);
  let jump = false;
  for (let k = 1; k < leaks.length; k++) if (leaks[k - 1] > 0 && ((leaks[k] - leaks[k - 1]) / leaks[k - 1]) * 100 > AVT_JUMP_LIMIT_PCT) jump = true;
  const leakMax = Math.max(0, ...leaks);
  return {
    testKv: plan.testKv,
    holdS: held,
    leakStart: leaks[0] ?? 0,
    leakEnd: leaks[leaks.length - 1] ?? 0,
    leakMax,
    pass: !tripped && !jump && held >= plan.holdS && leakMax < AVT_TRIP_MA,
    rows,
  };
}

async function fromPlc(plan: Plan, rows: AvtRow[], emit: Emit, log: (m: string) => void): Promise<AvtResult> {
  log('START sent to PLC');
  await run.pulse(AVT_TAGS.START);
  const t0 = Date.now();
  let nextRow = 0;
  let id = 0;
  let held = 0;
  let tripped = false;
  for (;;) {
    run.check();
    const [kv, leakMa, holdS, complete, trip] = await run.read(AVT_TAGS, ['KV', 'LEAK_MA', 'HOLD_S', 'COMPLETE', 'TRIP']);
    held = holdS;
    const phase: AvtPhase = holdS >= plan.holdS ? 'down' : holdS > 0 ? 'hold' : 'ramp';
    if (phase === 'hold' && holdS >= nextRow) {
      rows.push({ id: id++, t: (Date.now() - t0) / 1000, kv, leakMa, note: `HOLD ${Math.round(holdS)} s` });
      nextRow += 10;
    }
    emit({ phase, kv, leakMa, holdS });
    if (trip) {
      tripped = true;
      log('TEST SET TRIPPED · flash-over or leakage over limit');
      break;
    }
    if (complete) break;
    await run.sleep(READ_EVERY_MS);
  }
  log('PLC reports AVT complete');
  return verdict(plan, rows, held, tripped);
}

async function demo(plan: Plan, rows: AvtRow[], emit: Emit, log: (m: string) => void): Promise<AvtResult> {
  const STEP = 100;
  const SPEED = 2;
  // capacitive leakage I = 2π f C V, with C(HV → LV + earth) ≈ 1.4 nF
  const C = 1.4e-9;
  const leak = (kv: number, drift = 0) => Math.max(0, 2 * Math.PI * plan.hz * C * kv * 1000 * 1000 * (1 + drift + jitter(0.01)));
  const t0 = Date.now();
  let id = 0;
  const now = () => (Date.now() - t0) / 1000;
  const push = (kv: number, note: string, drift = 0) => rows.push({ id: id++, t: now(), kv, leakMa: leak(kv, drift), note });

  log(`DEMO · raising to ${plan.testKv} kV (Um ${plan.um} kV class)`);
  const RAMP_MS = 9000;
  let marks = [0.33, 0.66];
  for (let t = 0; t <= RAMP_MS; t += STEP) {
    run.check();
    const kv = plan.testKv * (1 - Math.pow(1 - t / RAMP_MS, 1.5));
    emit({ phase: 'ramp', kv, leakMa: leak(kv), holdS: 0 });
    if (marks.length && kv >= plan.testKv * marks[0]) {
      push(kv, `RAISING ${Math.round(marks[0] * 100)} %`);
      marks = marks.slice(1);
    }
    await run.sleep(STEP);
  }
  push(plan.testKv, 'TEST VOLTAGE');
  log(`${plan.testKv} kV applied HV → LV + earth · holding ${plan.holdS} s`);

  let nextRow = 10;
  for (let held = 0; held < plan.holdS; held += (STEP / 1000) * SPEED) {
    run.check();
    const drift = 0.008 * (held / plan.holdS);
    const kv = plan.testKv * (1 + jitter(0.002));
    emit({ phase: 'hold', kv, leakMa: leak(kv, drift), holdS: held });
    if (held >= nextRow) {
      push(kv, `HOLD ${nextRow} s`, drift);
      nextRow += 10;
    }
    await run.sleep(STEP);
  }
  push(plan.testKv, `HOLD ${plan.holdS} s`, 0.008);
  log(`Held ${plan.holdS} s · no flash-over · leakage steady`);

  const DOWN_MS = 4000;
  for (let t = 0; t <= DOWN_MS; t += STEP) {
    run.check();
    const kv = plan.testKv * Math.pow(1 - t / DOWN_MS, 1.3);
    emit({ phase: 'down', kv, leakMa: leak(kv), holdS: plan.holdS });
    await run.sleep(STEP);
  }
  push(0, 'OFF');
  log('DEMO · HV discharged and earthed');
  return verdict(plan, rows, plan.holdS, false);
}
