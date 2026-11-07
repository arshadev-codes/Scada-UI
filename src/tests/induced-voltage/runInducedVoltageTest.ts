/**
 * Induced Overvoltage withstand test (IEC 60076-3).
 *
 *   1. The frequency converter runs up to 2 × rated frequency (100 Hz on a 50 Hz unit)
 *   2. The variac raises the step-up set until HV sees 2 × rated voltage (11 kV → 22 kV)
 *   3. Held for 120 × f_rated / f_test seconds (60 s at 100 Hz, never under 15 s)
 *   4. Ramped down; PASS when the voltage held without collapse and the current stayed steady
 *
 * The doubled frequency keeps the core flux at its rated value: twice the
 * voltage at twice the frequency means the turns are stressed 2×, but the core
 * does not saturate.
 *
 * While IVT_TAGS has empty addresses, DEMO data is played instead through the
 * same callbacks.
 */
import type { TestObject } from '@/store/types';
import { createRunControl, jitter, READ_EVERY_MS, tagsReady } from '@/tests/shared/runtime';
import { demoCurrents } from '@/tests/shared/transformer';
import { toNumber } from '@/lib/electrical';
import { IVT_TAGS } from './tags';

export type IvtPhase = 'connect' | 'ramp' | 'hold' | 'down' | 'done';

export interface IvtRow {
  id: number;
  /** Seconds since START */
  t: number;
  kv: number;
  hz: number;
  ma: number;
  lvV: number;
  note: string;
}

export interface IvtReading {
  phase: IvtPhase;
  kv: number;
  hz: number;
  ma: number;
  lvV: number;
  holdS: number;
  rows: IvtRow[];
}

export interface IvtResult {
  ratedKv: number;
  targetKv: number;
  hz: number;
  holdS: number;
  maStart: number;
  maEnd: number;
  pass: boolean;
  rows: IvtRow[];
}

export interface IvtCallbacks {
  log?: (msg: string) => void;
  onReading?: (r: IvtReading) => void;
}

/** Step-up set: 415 V variac side → 33 kV HV side. */
export const IVT_STEP_UP = { lvV: 415, hvKv: 33 };
/** Current may not rise more than this during the hold. */
export const IVT_CURRENT_RISE_LIMIT_PCT = 10;

const run = createRunControl();
export const stopInducedVoltageTest = () => run.stop();
export const ivtUsesPlc = () => tagsReady(IVT_TAGS);

export function ivtPlan(o: TestObject) {
  const ratedKv = toNumber(o.hvVoltageKv) || 11;
  const lvV = toNumber(o.lvVoltageV) || 440;
  const fn = Number(o.frequency) || 50;
  const hz = fn * 2;
  return {
    ratedKv,
    targetKv: +(ratedKv * 2).toFixed(2),
    ratedLvV: lvV,
    mainsHz: fn,
    hz,
    holdS: Math.max(15, Math.round((120 * fn) / hz)),
  };
}

/** Variac output (V) for an HV voltage (kV) through the step-up set. */
export const ivtVariacV = (kv: number) => (kv / IVT_STEP_UP.hvKv) * IVT_STEP_UP.lvV;

export async function runInducedVoltageTest(o: TestObject, cb: IvtCallbacks = {}): Promise<IvtResult> {
  const log = cb.log ?? console.log;
  const plan = ivtPlan(o);
  const rows: IvtRow[] = [];
  run.reset();
  const emit = (r: Omit<IvtReading, 'rows'>) => cb.onReading?.({ ...r, rows: [...rows] });

  try {
    emit({ phase: 'connect', kv: 0, hz: 0, ma: 0, lvV: 0, holdS: 0 });
    log(`Frequency converter running up to ${plan.hz} Hz · LV open`);
    await run.sleep(2600);
    const r = ivtUsesPlc() ? await fromPlc(plan, rows, emit, log) : await demo(o, plan, rows, emit, log);
    emit({ phase: 'done', kv: 0, hz: 0, ma: 0, lvV: 0, holdS: r.holdS });
    return r;
  } catch (error) {
    emit({ phase: 'done', kv: 0, hz: 0, ma: 0, lvV: 0, holdS: 0 });
    log(`Test stopped: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

type Plan = ReturnType<typeof ivtPlan>;
type Emit = (r: Omit<IvtReading, 'rows'>) => void;

function verdict(plan: Plan, rows: IvtRow[], held: number, tripped: boolean): IvtResult {
  const holdRows = rows.filter((r) => r.note.startsWith('HOLD') || r.note === 'TEST VOLTAGE');
  const maStart = holdRows[0]?.ma ?? 0;
  const maEnd = holdRows[holdRows.length - 1]?.ma ?? 0;
  const steady = maStart <= 0 || ((maEnd - maStart) / maStart) * 100 <= IVT_CURRENT_RISE_LIMIT_PCT;
  return { ratedKv: plan.ratedKv, targetKv: plan.targetKv, hz: plan.hz, holdS: held, maStart, maEnd, pass: !tripped && held >= plan.holdS && steady, rows };
}

async function fromPlc(plan: Plan, rows: IvtRow[], emit: Emit, log: (m: string) => void): Promise<IvtResult> {
  log('START sent to PLC');
  await run.pulse(IVT_TAGS.START);
  const t0 = Date.now();
  let nextRow = 0;
  let id = 0;
  let held = 0;
  let tripped = false;
  for (;;) {
    run.check();
    const [kv, hz, ma, lvV, holdS, complete, trip] = await run.read(IVT_TAGS, ['KV', 'HZ', 'MA', 'LV_V', 'HOLD_S', 'COMPLETE', 'TRIP']);
    held = holdS;
    const phase: IvtPhase = holdS >= plan.holdS ? 'down' : holdS > 0 ? 'hold' : 'ramp';
    if (phase === 'hold' && holdS >= nextRow) {
      rows.push({ id: id++, t: (Date.now() - t0) / 1000, kv, hz, ma, lvV, note: `HOLD ${Math.round(holdS)} s` });
      nextRow += 10;
    }
    emit({ phase, kv, hz, ma, lvV, holdS });
    if (trip) {
      tripped = true;
      log('TEST SET TRIPPED · insulation failure suspected');
      break;
    }
    if (complete) break;
    await run.sleep(READ_EVERY_MS);
  }
  log('PLC reports IVT complete');
  return verdict(plan, rows, held, tripped);
}

/** Demo: realistic ramp, hold and ramp-down; the hold clock runs 2× fast. */
async function demo(o: TestObject, plan: Plan, rows: IvtRow[], emit: Emit, log: (m: string) => void): Promise<IvtResult> {
  const STEP = 100;
  const SPEED = 2;
  // magnetising current at test voltage ≈ 1.5 % of rated HV current (flux is at its rated value)
  const i0 = demoCurrents(o).hv * 0.015 * 1000;
  const t0 = Date.now();
  let id = 0;
  const now = () => (Date.now() - t0) / 1000;
  const reading = (kv: number, drift = 0) => {
    const f = kv / plan.targetKv;
    return {
      ma: Math.max(0, i0 * Math.pow(f, 1.4) * (1 + drift + jitter(0.006))),
      lvV: (kv / plan.ratedKv) * plan.ratedLvV,
    };
  };
  const push = (kv: number, note: string, drift = 0) => {
    const r = reading(kv, drift);
    rows.push({ id: id++, t: now(), kv, hz: plan.hz, ma: r.ma, lvV: r.lvV, note });
  };

  log(`DEMO · raising HV to ${plan.targetKv} kV at ${plan.hz} Hz`);
  const RAMP_MS = 11000;
  let marks = [0.5, 1, 1.5];
  for (let t = 0; t <= RAMP_MS; t += STEP) {
    run.check();
    const kv = plan.targetKv * (1 - Math.pow(1 - t / RAMP_MS, 1.6));
    const r = reading(kv);
    emit({ phase: 'ramp', kv, hz: plan.hz, ma: r.ma, lvV: r.lvV, holdS: 0 });
    const m = marks[0];
    if (m !== undefined && kv >= plan.ratedKv * m) {
      marks = marks.slice(1);
      push(kv, m === 1 ? 'RATED VOLTAGE' : `${m.toFixed(1)} × Un`);
      log(m === 1 ? `Rated ${plan.ratedKv} kV reached — going into overvoltage` : `${(kv).toFixed(1)} kV · ${m.toFixed(1)} × rated`);
    }
    await run.sleep(STEP);
  }
  push(plan.targetKv, 'TEST VOLTAGE');
  log(`${plan.targetKv} kV (2 × Un) at ${plan.hz} Hz · holding ${plan.holdS} s`);

  let nextRow = 10;
  for (let held = 0; held < plan.holdS; held += (STEP / 1000) * SPEED) {
    run.check();
    const drift = 0.012 * (held / plan.holdS);
    const kv = plan.targetKv * (1 + jitter(0.002));
    const r = reading(kv, drift);
    emit({ phase: 'hold', kv, hz: plan.hz, ma: r.ma, lvV: r.lvV, holdS: held });
    if (held >= nextRow) {
      push(kv, `HOLD ${nextRow} s`, drift);
      nextRow += 10;
    }
    await run.sleep(STEP);
  }
  push(plan.targetKv, `HOLD ${plan.holdS} s`, 0.012);
  log(`Held ${plan.holdS} s · no collapse · ramping down`);

  const DOWN_MS = 4500;
  for (let t = 0; t <= DOWN_MS; t += STEP) {
    run.check();
    const kv = plan.targetKv * Math.pow(1 - t / DOWN_MS, 1.3);
    const r = reading(kv);
    emit({ phase: 'down', kv, hz: plan.hz, ma: r.ma, lvV: r.lvV, holdS: plan.holdS });
    await run.sleep(STEP);
  }
  push(0, 'OFF');
  log('DEMO · supply off');
  return verdict(plan, rows, plan.holdS, false);
}
